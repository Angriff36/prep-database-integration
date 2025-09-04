import { supabase } from '../supabase';

interface PrepItem {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  category?: string;
  completed?: boolean;
  assignedTo?: string;
  notes?: string;
}

interface PrepList {
  id: string;
  name: string;
  items: PrepItem[];
  company_id?: string;
}

interface Event {
  id: string;
  name: string;
  date: string;
  invoiceNumber?: string;
  prepItems: PrepItem[];
  status: 'planning' | 'prep' | 'active' | 'complete';
  totalServings: number;
}

interface Recipe {
  id: string;
  name: string;
  description?: string;
  ingredients: string[];
  instructions: string[];
  yield?: string;
  prepTime?: number;
  cookTime?: number;
  totalTime?: number;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  tags?: string[];
  notes?: string;
  image?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Method {
  id: string;
  name: string;
  description?: string;
  category?: string;
  videoUrl?: string;
  instructions: string[];
  estimatedTime?: number;
  difficultyLevel?: 'Beginner' | 'Intermediate' | 'Advanced';
  tags?: string[];
  equipment?: string[];
  tips?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface Container {
  id: string;
  name: string;
  type: string;
  size?: string;
  description?: string;
}

// Database service with authentication and error handling
export class DatabaseService {
  private static connectionCache: { isConnected: boolean; lastCheck: number } | null = null;
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

  // Add operation locks to prevent race conditions
  private static operationLocks = new Map<string, Promise<any>>();

  // Add duplicate prevention cache
  private static recentOperations = new Map<string, { timestamp: number; data: any }>();
  private static readonly DUPLICATE_WINDOW = 2000; // 2 seconds window for duplicate prevention

  // Cached connection test to avoid excessive API calls
  static async testConnection(): Promise<boolean> {
    const now = Date.now();

    // Return cached result if still valid
    if (this.connectionCache && (now - this.connectionCache.lastCheck) < this.CACHE_DURATION) {
      return this.connectionCache.isConnected;
    }

    try {
      // Check site access instead of complex authentication
      const hasAccess = localStorage.getItem('prepchef:access_granted') === '1';
      if (!hasAccess) {
        console.warn('[DatabaseService] Site access not granted');
        this.connectionCache = { isConnected: false, lastCheck: now };
        return false;
      }

      // Check if Supabase is properly configured
      if (!supabase || !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        console.warn('[DatabaseService] Supabase not configured');
        this.connectionCache = { isConnected: false, lastCheck: now };
        return false;
      }

      // Only test actual connection if cache is expired
      const { error } = await supabase.from('prep_lists').select('count').limit(1);
      const isConnected = !error;

      this.connectionCache = { isConnected, lastCheck: now };
      return isConnected;
    } catch (error) {
      console.error('[DatabaseService] Connection test failed:', error);
      this.connectionCache = { isConnected: false, lastCheck: now };
      return false;
    }
  }

  // Force refresh the connection cache (call after auth changes)
  static refreshConnectionCache(): void {
    this.connectionCache = null;
  }

  // Generate operation key for duplicate prevention
  private static generateOperationKey(operation: string, data: any): string {
    if (operation === 'savePrepList' && data?.id) {
      return `prepList_${data.id}_${data.name || 'unnamed'}`;
    }
    if (operation === 'saveEvent' && data?.id) {
      return `event_${data.id}_${data.name || 'unnamed'}`;
    }
    return `${operation}_${JSON.stringify(data).slice(0, 100)}`;
  }

  // Check for duplicate operations
  private static isDuplicateOperation(operationKey: string, data: any): boolean {
    const recent = this.recentOperations.get(operationKey);
    if (!recent) return false;

    const now = Date.now();
    if (now - recent.timestamp > this.DUPLICATE_WINDOW) {
      this.recentOperations.delete(operationKey);
      return false;
    }

    // Check if data is essentially the same
    return JSON.stringify(recent.data) === JSON.stringify(data);
  }

  // Execute operation with locking to prevent race conditions
  private static async executeWithLock<T>(
    operationKey: string,
    operation: () => Promise<T>
  ): Promise<T> {
    // Check if operation is already in progress
    const existingOperation = this.operationLocks.get(operationKey);
    if (existingOperation) {
      console.debug(`[DatabaseService] Waiting for existing ${operationKey} operation`);
      return existingOperation;
    }

    // Create new operation promise
    const operationPromise = operation().finally(() => {
      this.operationLocks.delete(operationKey);
    });

    this.operationLocks.set(operationKey, operationPromise);
    return operationPromise;
  }

  // Prep Lists
  static async savePrepList(prepList: PrepList): Promise<PrepList> {
    const operationKey = this.generateOperationKey('savePrepList', prepList);

    // Check for duplicate operations
    if (this.isDuplicateOperation(operationKey, prepList)) {
      console.debug('[DatabaseService] Duplicate prep list save prevented');
      return prepList;
    }

    // Execute with locking to prevent race conditions
    return this.executeWithLock(operationKey, async () => {
      try {
        const isConnected = await this.testConnection();
        if (!isConnected) {
          throw new Error('Database connection required for data persistence');
        }

        // Validate data before saving to Supabase
        if (!prepList.id || !prepList.name) {
          throw new Error('Invalid prep list data: missing id or name');
        }

        const { data, error } = await supabase
          .from('prep_lists')
          .upsert({
            id: prepList.id,
            name: prepList.name,
            items: prepList.items,
            company_id: prepList.company_id // Ensure company_id is included
          })
          .select()
          .single();

        if (error) {
          // Check if it's a duplicate key error
          if (error.code === '23505') {
            console.warn('[DatabaseService] Duplicate prep list detected, fetching existing');
            // Try to fetch the existing record
            const { data: existing } = await supabase
              .from('prep_lists')
              .select('*')
              .eq('id', prepList.id)
              .single();

            if (existing) {
              return {
                id: existing.id,
                name: existing.name,
                items: existing.items || []
              };
            }
          }
          throw error;
        }

        // Record operation for duplicate prevention
        this.recentOperations.set(operationKey, {
          timestamp: Date.now(),
          data: prepList
        });

        return {
          id: data.id,
          name: data.name,
          items: data.items || []
        };
      } catch (error) {
        console.error('[DatabaseService] Failed to save prep list:', error);
        throw error;
      }
    });
  }

  static async loadPrepLists(): Promise<PrepList[]> {
    try {
      const isConnected = await this.testConnection();
      if (!isConnected) {
        throw new Error('Database connection required to load data');
      }

      const { data, error } = await supabase
        .from('prep_lists')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const prepLists = (data || []).map(item => ({
        id: item.id,
        name: item.name,
        items: item.items || [],
        company_id: item.company_id
      }));

      // Validate and deduplicate database data
      const validLists = prepLists.filter(p => p.id && p.name);
      return this.deduplicatePrepLists(validLists);
    } catch (error) {
      console.error('[DatabaseService] Failed to load prep lists:', error);
      throw error;
    }
  }

  // Helper method to deduplicate prep lists
  private static deduplicatePrepLists(prepLists: PrepList[]): PrepList[] {
    const seen = new Map<string, PrepList>();

    for (const list of prepLists) {
      const key = `${list.name}_${list.company_id || 'no-company'}`;
      const existing = seen.get(key);

      if (!existing) {
        seen.set(key, list);
      } else {
        // Keep the more recent one (by assuming newer items have more items or checking timestamps)
        if ((list.items?.length || 0) > (existing.items?.length || 0)) {
          seen.set(key, list);
        }
        console.warn(`[DatabaseService] Duplicate prep list detected: ${key}`);
      }
    }

    return Array.from(seen.values());
  }

  static async deletePrepList(id: string): Promise<void> {
    const operationKey = `deletePrepList_${id}`;

    // Execute with locking to prevent race conditions
    return this.executeWithLock(operationKey, async () => {
      try {
        const isConnected = await this.testConnection();
        if (!isConnected) {
          throw new Error('Database connection required for data deletion');
        }

        const { error } = await supabase
          .from('prep_lists')
          .delete()
          .eq('id', id);

        if (error) throw error;
      } catch (error) {
        console.error('[DatabaseService] Failed to delete prep list:', error);
        throw error;
      }
    });
  }

  // Events (similar pattern with auth check)
  static async saveEvent(event: Event): Promise<Event> {
    try {
      const isConnected = await this.testConnection();
      if (!isConnected) {
        throw new Error('Database connection required for data persistence');
      }

      const { data, error } = await supabase
        .from('events')
        .upsert({
          id: event.id,
          name: event.name,
          date: event.date,
          invoice_number: event.invoiceNumber,
          prep_items: event.prepItems,
          status: event.status,
          total_servings: event.totalServings
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        date: data.date,
        invoiceNumber: data.invoice_number,
        prepItems: data.prep_items || [],
        status: data.status,
        totalServings: data.total_servings || 0
      };
    } catch (error) {
      console.error('[DatabaseService] Failed to save event:', error);
      throw error;
    }
  }

  static async loadEvents(): Promise<Event[]> {
    try {
      const isConnected = await this.testConnection();
      if (!isConnected) {
        throw new Error('Database connection required to load data');
      }

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;

      return (data || []).map(item => ({
        id: item.id,
        name: item.name,
        date: item.date,
        invoiceNumber: item.invoice_number,
        prepItems: item.prep_items || [],
        status: item.status,
        totalServings: item.total_servings || 0
      }));
    } catch (error) {
      console.error('[DatabaseService] Failed to load events:', error);
      throw error;
    }
  }

  // Additional CRUD operations for other data types...
  static async saveRecipe(recipe: Recipe): Promise<Recipe> {
    const isConnected = await this.testConnection();
    if (!isConnected) {
      throw new Error('Database connection required for data persistence');
    }

    const { data, error } = await supabase
      .from('recipes')
      .upsert({
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        yield: recipe.yield,
        prep_time: recipe.prepTime,
        cook_time: recipe.cookTime,
        total_time: recipe.totalTime,
        difficulty: recipe.difficulty,
        tags: recipe.tags,
        notes: recipe.notes,
        image: recipe.image,
        created_at: recipe.createdAt,
        updated_at: recipe.updatedAt
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async loadRecipes(): Promise<Recipe[]> {
    const isConnected = await this.testConnection();
    if (!isConnected) {
      throw new Error('Database connection required to load data');
    }

    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // Connection diagnostics for debugging
  static async diagnoseConnection(): Promise<{
    configured: boolean;
    accessible: boolean;
    tables: string[];
    errors: string[];
  }> {
    const diagnosis = {
      configured: false,
      accessible: false,
      tables: [] as string[],
      errors: [] as string[]
    };

    try {
      // Check configuration
      const hasUrl = Boolean(import.meta.env.VITE_SUPABASE_URL);
      const hasKey = Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);
      
      if (!hasUrl) diagnosis.errors.push('VITE_SUPABASE_URL not configured');
      if (!hasKey) diagnosis.errors.push('VITE_SUPABASE_ANON_KEY not configured');
      
      diagnosis.configured = hasUrl && hasKey;

      if (diagnosis.configured) {
        // Test basic connectivity
        const { data, error } = await supabase.from('prep_lists').select('count').limit(1);
        
        if (error) {
          diagnosis.errors.push(`Database access error: ${error.message}`);
        } else {
          diagnosis.accessible = true;
          
          // List available tables (this might fail with RLS)
          try {
            const tables = ['prep_lists', 'events', 'recipes', 'methods', 'containers'];
            for (const table of tables) {
              const { error: tableError } = await supabase.from(table).select('count').limit(1);
              if (!tableError) {
                diagnosis.tables.push(table);
              }
            }
          } catch (e) {
            // RLS might prevent this, but that's okay
          }
        }
      }
    } catch (error) {
      diagnosis.errors.push(`Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return diagnosis;
  }
}