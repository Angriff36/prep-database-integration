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
  created_at?: string;
  updated_at?: string;
}

interface Event {
  id: string;
  name: string;
  date: string;
  invoiceNumber?: string;
  prepItems: PrepItem[];
  status: 'planning' | 'prep' | 'active' | 'complete';
  totalServings: number;
  company_id?: string;
  created_at?: string;
  updated_at?: string;
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
  company_id?: string;
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
  company_id?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Container {
  id: string;
  name: string;
  type: string;
  size?: string;
  description?: string;
  company_id?: string;
}

export class DatabaseService {
  private static isInitialized = false;
  private static connectionPromise: Promise<boolean> | null = null;
  private static currentUser: any = null;

  // Initialize the service and set up auth listener
  static async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Get initial session
      const { data: { session } } = await supabase.auth.getSession();
      this.currentUser = session?.user || null;

      // Listen for auth changes
      supabase.auth.onAuthStateChange((event, session) => {
        this.currentUser = session?.user || null;
        this.connectionPromise = null; // Reset connection cache on auth change
        console.log(`[DatabaseService] Auth state changed: ${event}`);
      });

      this.isInitialized = true;
      console.log('[DatabaseService] Initialized successfully');
    } catch (error) {
      console.error('[DatabaseService] Initialization failed:', error);
      throw error;
    }
  }

  // Improved connection testing with proper error handling
  static async testConnection(): Promise<boolean> {
    // Return existing connection test if in progress
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._performConnectionTest();
    return this.connectionPromise;
  }

  private static async _performConnectionTest(): Promise<boolean> {
    try {
      // Ensure service is initialized
      await this.initialize();

      // Check if Supabase is properly configured
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        console.error('[DatabaseService] Missing Supabase configuration');
        return false;
      }

      // Test basic connectivity with a simple query
      const { error } = await supabase.from('prep_lists').select('count').limit(1);
      
      if (error) {
        console.error('[DatabaseService] Connection test failed:', error);
        return false;
      }

      console.log('[DatabaseService] Connection test successful');
      return true;
    } catch (error) {
      console.error('[DatabaseService] Connection test error:', error);
      return false;
    }
  }

  // Enhanced error handling wrapper
  private static async executeWithErrorHandling<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    try {
      // Ensure connection is available
      const isConnected = await this.testConnection();
      if (!isConnected) {
        throw new Error('Database connection not available. Please check your Supabase configuration.');
      }

      return await fn();
    } catch (error: any) {
      // Enhanced error logging with context
      console.error(`[DatabaseService:${operation}] Operation failed:`, {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        user: this.currentUser?.id || 'unauthenticated'
      });

      // Provide better error messages for common issues
      if (error.code === '42P01') {
        throw new Error(`Table not found. Please ensure database migrations have been run.`);
      }
      if (error.code === '42501' || error.message?.includes('RLS')) {
        throw new Error(`Access denied. Please check Row Level Security policies or authentication.`);
      }
      if (error.code === '23505') {
        throw new Error(`Duplicate entry detected. This item may already exist.`);
      }
      if (error.message?.includes('JWT')) {
        throw new Error(`Authentication token invalid. Please refresh and try again.`);
      }

      throw error;
    }
  }

  // Prep Lists with improved error handling
  static async savePrepList(prepList: PrepList): Promise<PrepList> {
    return this.executeWithErrorHandling('savePrepList', async () => {
      // Validate required fields
      if (!prepList.id || !prepList.name?.trim()) {
        throw new Error('Prep list must have a valid ID and name');
      }

      // Sanitize data
      const sanitizedList = {
        id: prepList.id,
        name: prepList.name.trim(),
        items: Array.isArray(prepList.items) ? prepList.items : [],
        company_id: prepList.company_id || null
      };

      const { data, error } = await supabase
        .from('prep_lists')
        .upsert(sanitizedList, {
          onConflict: 'id',
          ignoreDuplicates: false
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        items: data.items || [],
        company_id: data.company_id,
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    });
  }

  static async loadPrepLists(): Promise<PrepList[]> {
    return this.executeWithErrorHandling('loadPrepLists', async () => {
      const { data, error } = await supabase
        .from('prep_lists')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Validate and clean data
      return (data || [])
        .filter(item => item && item.id && item.name)
        .map(item => ({
          id: item.id,
          name: item.name,
          items: Array.isArray(item.items) ? item.items : [],
          company_id: item.company_id,
          created_at: item.created_at,
          updated_at: item.updated_at
        }));
    });
  }

  static async deletePrepList(id: string): Promise<void> {
    return this.executeWithErrorHandling('deletePrepList', async () => {
      if (!id?.trim()) {
        throw new Error('Valid ID required for deletion');
      }

      const { error } = await supabase
        .from('prep_lists')
        .delete()
        .eq('id', id.trim());

      if (error) throw error;
    });
  }

  // Events with improved error handling
  static async saveEvent(event: Event): Promise<Event> {
    return this.executeWithErrorHandling('saveEvent', async () => {
      // Validate required fields
      if (!event.id || !event.name?.trim() || !event.date) {
        throw new Error('Event must have valid ID, name, and date');
      }

      const sanitizedEvent = {
        id: event.id,
        name: event.name.trim(),
        date: event.date,
        invoice_number: event.invoiceNumber || null,
        prep_items: Array.isArray(event.prepItems) ? event.prepItems : [],
        status: event.status || 'planning',
        total_servings: Number(event.totalServings) || 0,
        company_id: event.company_id || null
      };

      const { data, error } = await supabase
        .from('events')
        .upsert(sanitizedEvent, {
          onConflict: 'id',
          ignoreDuplicates: false
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
        totalServings: data.total_servings || 0,
        company_id: data.company_id,
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    });
  }

  static async loadEvents(): Promise<Event[]> {
    return this.executeWithErrorHandling('loadEvents', async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;

      return (data || [])
        .filter(item => item && item.id && item.name)
        .map(item => ({
          id: item.id,
          name: item.name,
          date: item.date,
          invoiceNumber: item.invoice_number,
          prepItems: Array.isArray(item.prep_items) ? item.prep_items : [],
          status: item.status || 'planning',
          totalServings: Number(item.total_servings) || 0,
          company_id: item.company_id,
          created_at: item.created_at,
          updated_at: item.updated_at
        }));
    });
  }

  // Recipes with improved validation
  static async saveRecipe(recipe: Recipe): Promise<Recipe> {
    return this.executeWithErrorHandling('saveRecipe', async () => {
      if (!recipe.id || !recipe.name?.trim()) {
        throw new Error('Recipe must have valid ID and name');
      }

      const sanitizedRecipe = {
        id: recipe.id,
        name: recipe.name.trim(),
        description: recipe.description?.trim() || null,
        ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
        instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
        yield: recipe.yield?.trim() || null,
        prep_time: Number(recipe.prepTime) || null,
        cook_time: Number(recipe.cookTime) || null,
        total_time: Number(recipe.totalTime) || null,
        difficulty: recipe.difficulty || 'Medium',
        tags: Array.isArray(recipe.tags) ? recipe.tags : [],
        notes: recipe.notes?.trim() || null,
        image: recipe.image?.trim() || null,
        company_id: recipe.company_id || null
      };

      const { data, error } = await supabase
        .from('recipes')
        .upsert(sanitizedRecipe, {
          onConflict: 'id',
          ignoreDuplicates: false
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        description: data.description,
        ingredients: data.ingredients || [],
        instructions: data.instructions || [],
        yield: data.yield,
        prepTime: data.prep_time,
        cookTime: data.cook_time,
        totalTime: data.total_time,
        difficulty: data.difficulty,
        tags: data.tags || [],
        notes: data.notes,
        image: data.image,
        company_id: data.company_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    });
  }

  static async loadRecipes(): Promise<Recipe[]> {
    return this.executeWithErrorHandling('loadRecipes', async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || [])
        .filter(item => item && item.id && item.name)
        .map(item => ({
          id: item.id,
          name: item.name,
          description: item.description,
          ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
          instructions: Array.isArray(item.instructions) ? item.instructions : [],
          yield: item.yield,
          prepTime: item.prep_time,
          cookTime: item.cook_time,
          totalTime: item.total_time,
          difficulty: item.difficulty || 'Medium',
          tags: Array.isArray(item.tags) ? item.tags : [],
          notes: item.notes,
          image: item.image,
          company_id: item.company_id,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        }));
    });
  }

  // Enhanced connection diagnostics
  static async diagnoseConnection(): Promise<{
    configured: boolean;
    accessible: boolean;
    authenticated: boolean;
    tables: string[];
    errors: string[];
    user: any;
    policies: string[];
  }> {
    const diagnosis = {
      configured: false,
      accessible: false,
      authenticated: false,
      tables: [] as string[],
      errors: [] as string[],
      user: null as any,
      policies: [] as string[]
    };

    try {
      // Check configuration
      const hasUrl = Boolean(import.meta.env.VITE_SUPABASE_URL);
      const hasKey = Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);
      
      if (!hasUrl) diagnosis.errors.push('VITE_SUPABASE_URL not configured');
      if (!hasKey) diagnosis.errors.push('VITE_SUPABASE_ANON_KEY not configured');
      
      diagnosis.configured = hasUrl && hasKey;

      if (diagnosis.configured) {
        // Check authentication
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        
        if (authError) {
          diagnosis.errors.push(`Auth error: ${authError.message}`);
        } else if (session) {
          diagnosis.authenticated = true;
          diagnosis.user = {
            id: session.user.id,
            email: session.user.email,
            role: session.user.role
          };
        }

        // Test table accessibility
        const tablesToTest = ['prep_lists', 'events', 'recipes', 'methods', 'containers'];
        
        for (const table of tablesToTest) {
          try {
            const { data, error } = await supabase
              .from(table)
              .select('id')
              .limit(1);
              
            if (error) {
              diagnosis.errors.push(`Table '${table}': ${error.message}`);
            } else {
              diagnosis.tables.push(table);
              diagnosis.accessible = true;
            }
          } catch (e) {
            diagnosis.errors.push(`Table '${table}': ${e instanceof Error ? e.message : 'Unknown error'}`);
          }
        }

        // Check RLS policies if authenticated
        if (diagnosis.authenticated) {
          try {
            const { data: policies } = await supabase
              .from('pg_policies')
              .select('schemaname, tablename, policyname')
              .eq('schemaname', 'public');
              
            if (policies) {
              diagnosis.policies = policies.map(p => `${p.tablename}.${p.policyname}`);
            }
          } catch (e) {
            // RLS policies query might not be accessible - that's okay
            diagnosis.errors.push('Could not check RLS policies (may be restricted)');
          }
        }
      }
    } catch (error) {
      diagnosis.errors.push(`Connection diagnosis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Reset promise after completion
    this.connectionPromise = null;
    return diagnosis;
  }

  // Authentication helpers
  static async signIn(email: string, password: string): Promise<boolean> {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error('[DatabaseService] Sign in failed:', error);
        return false;
      }

      this.connectionPromise = null; // Reset connection cache
      return true;
    } catch (error) {
      console.error('[DatabaseService] Sign in error:', error);
      return false;
    }
  }

  static async signOut(): Promise<void> {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      this.currentUser = null;
      this.connectionPromise = null; // Reset connection cache
    } catch (error) {
      console.error('[DatabaseService] Sign out error:', error);
      throw error;
    }
  }

  static getCurrentUser(): any {
    return this.currentUser;
  }

  // Real-time subscription testing
  static createRealtimeChannel(table: string, callback: (payload: any) => void) {
    try {
      const channel = supabase
        .channel(`public:${table}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: table
        }, callback)
        .subscribe((status) => {
          console.log(`[DatabaseService] Realtime channel for '${table}': ${status}`);
        });

      return channel;
    } catch (error) {
      console.error(`[DatabaseService] Failed to create realtime channel for '${table}':`, error);
      throw error;
    }
  }

  // Bulk operations for testing
  static async createTestData(): Promise<void> {
    return this.executeWithErrorHandling('createTestData', async () => {
      const testData = {
        prepLists: [
          {
            id: 'test-prep-list-1',
            name: 'Test Prep List 1',
            items: [
              { id: '1', name: 'Test Item 1', quantity: '5', unit: 'lbs' },
              { id: '2', name: 'Test Item 2', quantity: '10', unit: 'pieces' }
            ]
          }
        ],
        events: [
          {
            id: 'test-event-1',
            name: 'Test Event 1',
            date: new Date().toISOString().split('T')[0],
            status: 'planning' as const,
            totalServings: 50,
            prepItems: []
          }
        ],
        recipes: [
          {
            id: 'test-recipe-1',
            name: 'Test Recipe 1',
            description: 'A test recipe for debugging',
            ingredients: ['Test ingredient 1', 'Test ingredient 2'],
            instructions: ['Test instruction 1', 'Test instruction 2'],
            difficulty: 'Easy' as const
          }
        ]
      };

      // Create test prep lists
      for (const list of testData.prepLists) {
        await this.savePrepList(list);
      }

      // Create test events  
      for (const event of testData.events) {
        await this.saveEvent(event);
      }

      // Create test recipes
      for (const recipe of testData.recipes) {
        await this.saveRecipe(recipe);
      }

      console.log('[DatabaseService] Test data created successfully');
    });
  }

  static async cleanupTestData(): Promise<void> {
    return this.executeWithErrorHandling('cleanupTestData', async () => {
      const testIds = {
        prepLists: ['test-prep-list-1'],
        events: ['test-event-1'],
        recipes: ['test-recipe-1']
      };

      // Delete test prep lists
      for (const id of testIds.prepLists) {
        try {
          await this.deletePrepList(id);
        } catch (e) {
          console.warn(`Failed to delete test prep list ${id}:`, e);
        }
      }

      // Delete test events
      for (const id of testIds.events) {
        try {
          await supabase.from('events').delete().eq('id', id);
        } catch (e) {
          console.warn(`Failed to delete test event ${id}:`, e);
        }
      }

      // Delete test recipes
      for (const id of testIds.recipes) {
        try {
          await supabase.from('recipes').delete().eq('id', id);
        } catch (e) {
          console.warn(`Failed to delete test recipe ${id}:`, e);
        }
      }

      console.log('[DatabaseService] Test data cleanup completed');
    });
  }
}

// Auto-initialize when imported
DatabaseService.initialize().catch(error => {
  console.error('[DatabaseService] Auto-initialization failed:', error);
});