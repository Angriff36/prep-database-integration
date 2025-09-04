import { supabase } from '../supabase';

interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  company_id?: string;
  role: 'user' | 'admin' | 'owner';
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

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
  private static userProfile: UserProfile | null = null;

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
        this.userProfile = null; // Reset profile cache
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

  // Get or create user profile
  private static async ensureUserProfile(): Promise<UserProfile | null> {
    if (!this.currentUser) return null;
    if (this.userProfile) return this.userProfile;

    try {
      // First try to get existing profile
      const { data: existingProfile, error: fetchError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', this.currentUser.id)
        .single();

      if (existingProfile && !fetchError) {
        this.userProfile = existingProfile;
        return this.userProfile;
      }

      // If no profile exists, create one
      const newProfile = {
        id: this.currentUser.id,
        email: this.currentUser.email,
        full_name: this.currentUser.user_metadata?.full_name || null,
        role: 'user' as const
      };

      const { data: createdProfile, error: createError } = await supabase
        .from('user_profiles')
        .upsert(newProfile, { onConflict: 'id' })
        .select()
        .single();

      if (createError) {
        console.error('[DatabaseService] Failed to create user profile:', createError);
        return null;
      }

      this.userProfile = createdProfile;
      return this.userProfile;
    } catch (error) {
      console.error('[DatabaseService] Error ensuring user profile:', error);
      return null;
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
      const { data, error } = await supabase.from('prep_lists').select('id').limit(1);
      
      if (error) {
        // Check if this is an RLS issue
        if (error.code === '42501' || error.message?.includes('RLS')) {
          console.warn('[DatabaseService] RLS policy restricting access (this is expected for unauthenticated users)');
          // Try a different approach - check if we can access auth info
          try {
            const { data: { session } } = await supabase.auth.getSession();
            console.log('[DatabaseService] Connection successful, RLS policies active', {
              authenticated: !!session,
              user: session?.user?.email || 'anonymous'
            });
            return true;
          } catch (authError) {
            console.error('[DatabaseService] Authentication check failed:', authError);
            return false;
          }
        } else {
          console.error('[DatabaseService] Connection test failed:', error);
          return false;
        }
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

      // Ensure user profile exists for authenticated operations
      if (this.currentUser) {
        await this.ensureUserProfile();
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

      // Ensure user is authenticated
      if (!this.currentUser) {
        throw new Error('Authentication required to save prep lists');
      }

      // Sanitize data
      const sanitizedList = {
        id: prepList.id,
        name: prepList.name.trim(),
        items: Array.isArray(prepList.items) ? prepList.items : [],
        company_id: prepList.company_id || null,
        user_id: this.currentUser.id
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
      if (!this.currentUser) {
        console.warn('[DatabaseService] Loading prep lists without authentication - may return empty results due to RLS');
      }

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

      // Ensure user is authenticated
      if (!this.currentUser) {
        throw new Error('Authentication required to save events');
      }

      const sanitizedEvent = {
        id: event.id,
        name: event.name.trim(),
        date: event.date,
        invoice_number: event.invoiceNumber || null,
        prep_items: Array.isArray(event.prepItems) ? event.prepItems : [],
        status: event.status || 'planning',
        total_servings: Number(event.totalServings) || 0,
        company_id: event.company_id || null,
        user_id: this.currentUser.id
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
      if (!this.currentUser) {
        console.warn('[DatabaseService] Loading events without authentication - may return empty results due to RLS');
      }

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

      // Ensure user is authenticated
      if (!this.currentUser) {
        throw new Error('Authentication required to save recipes');
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
        company_id: recipe.company_id || null,
        user_id: this.currentUser.id
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
      if (!this.currentUser) {
        console.warn('[DatabaseService] Loading recipes without authentication - may return empty results due to RLS');
      }

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

  // Method and Container operations (similar pattern)
  static async saveMethod(method: Method): Promise<Method> {
    return this.executeWithErrorHandling('saveMethod', async () => {
      if (!method.id || !method.name?.trim()) {
        throw new Error('Method must have valid ID and name');
      }

      if (!this.currentUser) {
        throw new Error('Authentication required to save methods');
      }

      const sanitizedMethod = {
        id: method.id,
        name: method.name.trim(),
        description: method.description?.trim() || null,
        category: method.category?.trim() || null,
        video_url: method.videoUrl?.trim() || null,
        instructions: Array.isArray(method.instructions) ? method.instructions : [],
        estimated_time: Number(method.estimatedTime) || null,
        difficulty_level: method.difficultyLevel || 'Intermediate',
        tags: Array.isArray(method.tags) ? method.tags : [],
        equipment: Array.isArray(method.equipment) ? method.equipment : [],
        tips: Array.isArray(method.tips) ? method.tips : [],
        company_id: method.company_id || null,
        user_id: this.currentUser.id
      };

      const { data, error } = await supabase
        .from('methods')
        .upsert(sanitizedMethod, { onConflict: 'id' })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        description: data.description,
        category: data.category,
        videoUrl: data.video_url,
        instructions: data.instructions || [],
        estimatedTime: data.estimated_time,
        difficultyLevel: data.difficulty_level,
        tags: data.tags || [],
        equipment: data.equipment || [],
        tips: data.tips || [],
        company_id: data.company_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    });
  }

  static async loadMethods(): Promise<Method[]> {
    return this.executeWithErrorHandling('loadMethods', async () => {
      if (!this.currentUser) {
        console.warn('[DatabaseService] Loading methods without authentication - may return empty results due to RLS');
      }

      const { data, error } = await supabase
        .from('methods')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || [])
        .filter(item => item && item.id && item.name)
        .map(item => ({
          id: item.id,
          name: item.name,
          description: item.description,
          category: item.category,
          videoUrl: item.video_url,
          instructions: Array.isArray(item.instructions) ? item.instructions : [],
          estimatedTime: item.estimated_time,
          difficultyLevel: item.difficulty_level || 'Intermediate',
          tags: Array.isArray(item.tags) ? item.tags : [],
          equipment: Array.isArray(item.equipment) ? item.equipment : [],
          tips: Array.isArray(item.tips) ? item.tips : [],
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
    userProfile: UserProfile | null;
    rlsStatus: { [table: string]: { enabled: boolean, policies: string[] } };
  }> {
    const diagnosis = {
      configured: false,
      accessible: false,
      authenticated: false,
      tables: [] as string[],
      errors: [] as string[],
      user: null as any,
      userProfile: null as UserProfile | null,
      rlsStatus: {} as { [table: string]: { enabled: boolean, policies: string[] } }
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
          
          // Get user profile
          diagnosis.userProfile = await this.ensureUserProfile();
        }

        // Test table accessibility
        const tablesToTest = ['user_profiles', 'prep_lists', 'events', 'recipes', 'methods', 'containers'];
        
        for (const table of tablesToTest) {
          try {
            const { data, error } = await supabase
              .from(table)
              .select('id')
              .limit(1);
              
            if (error) {
              if (error.code === '42501' || error.message?.includes('RLS')) {
                diagnosis.errors.push(`Table '${table}': RLS policy active (${diagnosis.authenticated ? 'user authenticated' : 'no authentication'})`);
                // Still count as accessible if RLS is working as expected
                diagnosis.tables.push(`${table} (RLS active)`);
                diagnosis.accessible = true;
              } else {
                diagnosis.errors.push(`Table '${table}': ${error.message}`);
              }
            } else {
              diagnosis.tables.push(table);
              diagnosis.accessible = true;
            }
          } catch (e) {
            diagnosis.errors.push(`Table '${table}': ${e instanceof Error ? e.message : 'Unknown error'}`);
          }
        }

        // Check RLS status for all tables
        const rlsQueries = [
          { table: 'user_profiles', schema: 'public' },
          { table: 'prep_lists', schema: 'public' },
          { table: 'events', schema: 'public' },
          { table: 'recipes', schema: 'public' },
          { table: 'methods', schema: 'public' },
          { table: 'containers', schema: 'public' }
        ];

        for (const { table, schema } of rlsQueries) {
          try {
            // Check if RLS is enabled
            const { data: rlsData } = await supabase
              .from('pg_class')
              .select('relname, relrowsecurity')
              .eq('relname', table)
              .single();

            const rlsEnabled = rlsData?.relrowsecurity || false;

            // Get policies for this table
            const { data: policies } = await supabase
              .from('pg_policies') 
              .select('policyname, permissive, roles, cmd')
              .eq('schemaname', schema)
              .eq('tablename', table);
              
            diagnosis.rlsStatus[table] = {
              enabled: rlsEnabled,
              policies: (policies || []).map(p => `${p.cmd}: ${p.policyname}`)
            };
          } catch (e) {
            diagnosis.rlsStatus[table] = {
              enabled: false,
              policies: ['Unable to check policies']
            };
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

  // RLS testing utilities
  static async testRLSPolicies(): Promise<{
    authenticated: boolean;
    tables: {
      [tableName: string]: {
        canRead: boolean;
        canInsert: boolean;
        canUpdate: boolean;
        canDelete: boolean;
        errors: string[];
      }
    }
  }> {
    const result = {
      authenticated: !!this.currentUser,
      tables: {} as any
    };

    const tablesToTest = ['prep_lists', 'events', 'recipes', 'methods', 'containers'];
    
    for (const table of tablesToTest) {
      result.tables[table] = {
        canRead: false,
        canInsert: false,
        canUpdate: false,
        canDelete: false,
        errors: []
      };

      // Test READ
      try {
        await supabase.from(table).select('id').limit(1);
        result.tables[table].canRead = true;
      } catch (error: any) {
        result.tables[table].errors.push(`Read: ${error.message}`);
      }

      // Only test write operations if authenticated
      if (this.currentUser) {
        const testId = `rls-test-${Date.now()}`;
        
        // Test INSERT
        try {
          let testData;
          switch (table) {
            case 'prep_lists':
              testData = { id: testId, name: 'RLS Test List', items: [] };
              break;
            case 'events':
              testData = { id: testId, name: 'RLS Test Event', date: new Date().toISOString().split('T')[0], status: 'planning', total_servings: 0 };
              break;
            case 'recipes':
              testData = { id: testId, name: 'RLS Test Recipe', ingredients: [], instructions: [] };
              break;
            case 'methods':
              testData = { id: testId, name: 'RLS Test Method', instructions: [] };
              break;
            case 'containers':
              testData = { id: testId, name: 'RLS Test Container', type: 'test' };
              break;
            default:
              continue;
          }

          const { error: insertError } = await supabase.from(table).insert(testData);
          if (!insertError) {
            result.tables[table].canInsert = true;

            // Test UPDATE
            try {
              const { error: updateError } = await supabase
                .from(table)
                .update({ name: 'RLS Test Updated' })
                .eq('id', testId);
              if (!updateError) result.tables[table].canUpdate = true;
            } catch (error: any) {
              result.tables[table].errors.push(`Update: ${error.message}`);
            }

            // Test DELETE (cleanup)
            try {
              const { error: deleteError } = await supabase
                .from(table)
                .delete()
                .eq('id', testId);
              if (!deleteError) result.tables[table].canDelete = true;
            } catch (error: any) {
              result.tables[table].errors.push(`Delete: ${error.message}`);
            }
          } else {
            result.tables[table].errors.push(`Insert: ${insertError.message}`);
          }
        } catch (error: any) {
          result.tables[table].errors.push(`Insert: ${error.message}`);
        }
      }
    }

    return result;
  }

  // User Profile Management
  static async getUserProfile(): Promise<UserProfile | null> {
    if (!this.currentUser) return null;
    
    try {
      return await this.ensureUserProfile();
    } catch (error) {
      console.error('[DatabaseService] Failed to get user profile:', error);
      return null;
    }
  }

  static async updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile | null> {
    if (!this.currentUser) {
      throw new Error('Authentication required to update profile');
    }

    return this.executeWithErrorHandling('updateUserProfile', async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .update({
          full_name: updates.full_name,
          company_id: updates.company_id,
          avatar_url: updates.avatar_url
        })
        .eq('id', this.currentUser.id)
        .select()
        .single();

      if (error) throw error;

      this.userProfile = data; // Update cache
      return data;
    });
  }

  // Auth helpers with better error handling
  static async signUp(email: string, password: string, userData?: { fullName?: string }): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: userData?.fullName || null
          }
        }
      });

      if (error) {
        console.error('[DatabaseService] Sign up failed:', error);
        return { success: false, error: error.message };
      }

      if (data.user) {
        // Create user profile
        await this.ensureUserProfile();
      }

      this.connectionPromise = null; // Reset connection cache
      return { success: true };
    } catch (error: any) {
      console.error('[DatabaseService] Sign up error:', error);
      return { success: false, error: error.message || 'Unknown error during sign up' };
    }
  }

  static async signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error('[DatabaseService] Sign in failed:', error);
        return { success: false, error: error.message };
      }

      if (data.user) {
        this.currentUser = data.user;
        await this.ensureUserProfile();
      }

      this.connectionPromise = null; // Reset connection cache
      return { success: true };
    } catch (error: any) {
      console.error('[DatabaseService] Sign in error:', error);
      return { success: false, error: error.message || 'Unknown error during sign in' };
    }
  }

  static async signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        return { success: false, error: error.message };
      }
      
      this.currentUser = null;
      this.userProfile = null;
      this.connectionPromise = null; // Reset connection cache
      return { success: true };
    } catch (error: any) {
      console.error('[DatabaseService] Sign out error:', error);
      return { success: false, error: error.message || 'Unknown error during sign out' };
    }
  }

  // Legacy method for backward compatibility  
  static async signIn_legacy(email: string, password: string): Promise<boolean> {
    const result = await this.signIn(email, password);
    return result.success;
  }

  static getCurrentUser(): any {
    return this.currentUser;
  }

  static getCurrentUserProfile(): UserProfile | null {
    return this.userProfile;
  }

  // Company management helpers
  static async getUsersByCompany(companyId: string): Promise<UserProfile[]> {
    if (!this.currentUser) {
      throw new Error('Authentication required');
    }

    return this.executeWithErrorHandling('getUsersByCompany', async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('company_id', companyId);

      if (error) throw error;
      return data || [];
    });
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

  // Improved bulk operations
  static async createTestData(options: { 
    includeAuth?: boolean;
    testEmail?: string;
    testPassword?: string;
  } = {}): Promise<void> {
    return this.executeWithErrorHandling('createTestData', async () => {
      // If auth is requested and user is not authenticated, attempt to create test user
      if (options.includeAuth && !this.currentUser) {
        const email = options.testEmail || 'test@prepchef.com';
        const password = options.testPassword || 'test123456';
        
        console.log('[DatabaseService] Creating test user for data creation...');
        const authResult = await this.signUp(email, password, { fullName: 'Test User' });
        
        if (!authResult.success) {
          // If user already exists, try to sign in
          const signInResult = await this.signIn(email, password);
          if (!signInResult.success) {
            throw new Error(`Failed to authenticate test user: ${signInResult.error}`);
          }
        }
      }

      if (!this.currentUser) {
        throw new Error('Authentication required to create test data');
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      const testData = {
        prepLists: [
          {
            id: `test-prep-list-${timestamp}`,
            name: `Test Prep List ${new Date().toLocaleTimeString()}`,
            items: [
              { id: '1', name: 'Test Item 1', quantity: '5', unit: 'lbs' },
              { id: '2', name: 'Test Item 2', quantity: '10', unit: 'pieces' }
            ]
          }
        ],
        events: [
          {
            id: `test-event-${timestamp}`,
            name: `Test Event ${new Date().toLocaleTimeString()}`,
            date: new Date().toISOString().split('T')[0],
            status: 'planning' as const,
            totalServings: 50,
            prepItems: []
          }
        ],
        recipes: [
          {
            id: `test-recipe-${timestamp}`,
            name: `Test Recipe ${new Date().toLocaleTimeString()}`,
            description: 'A test recipe for debugging',
            ingredients: ['Test ingredient 1', 'Test ingredient 2'],
            instructions: ['Test instruction 1', 'Test instruction 2'],
            difficulty: 'Easy' as const
          }
        ],
        methods: [
          {
            id: `test-method-${timestamp}`,
            name: `Test Method ${new Date().toLocaleTimeString()}`,
            description: 'A test cooking method',
            instructions: ['Step 1', 'Step 2'],
            difficultyLevel: 'Beginner' as const
          }
        ],
        containers: [
          {
            id: `test-container-${timestamp}`,
            name: `Test Container ${new Date().toLocaleTimeString()}`,
            type: 'storage',
            size: 'medium'
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

      // Create test methods
      for (const method of testData.methods) {
        await this.saveMethod(method);
      }

      // Create test containers
      const containerPromises = testData.containers.map(async (container) => {
        const { error } = await supabase
          .from('containers')
          .insert({
            id: container.id,
            name: container.name,
            type: container.type,
            size: container.size,
            user_id: this.currentUser?.id
          });
        if (error) throw error;
      });
      
      await Promise.all(containerPromises);

      console.log('[DatabaseService] Test data created successfully', {
        prepLists: testData.prepLists.length,
        events: testData.events.length,
        recipes: testData.recipes.length,
        methods: testData.methods.length,
        containers: testData.containers.length,
        user: this.currentUser?.email
      });
    });
  }

  static async cleanupTestData(): Promise<void> {
    return this.executeWithErrorHandling('cleanupTestData', async () => {
      if (!this.currentUser) {
        throw new Error('Authentication required to cleanup test data');
      }

      const tablesToClean = ['prep_lists', 'events', 'recipes', 'methods', 'containers'];
      let totalDeleted = 0;

      for (const table of tablesToClean) {
        const { data: testItems, error: fetchError } = await supabase
          .from(table)
          .select('id, name')
          .ilike('name', 'Test %')
          .eq('user_id', this.currentUser.id);

        if (fetchError) {
          console.warn(`Failed to fetch test items from ${table}:`, fetchError);
          continue;
        }

        if (testItems && testItems.length > 0) {
          const ids = testItems.map(item => item.id);
          const { error: deleteError } = await supabase
            .from(table)
            .delete()
            .in('id', ids);

          if (deleteError) {
            console.warn(`Failed to delete test items from ${table}:`, deleteError);
          } else {
            totalDeleted += testItems.length;
            console.log(`Cleaned up ${testItems.length} test items from ${table}`);
          }
        }
      }

      console.log(`[DatabaseService] Test data cleanup completed - deleted ${totalDeleted} items`);
    });
  }
}

// Auto-initialize when imported
DatabaseService.initialize().catch(error => {
  console.error('[DatabaseService] Auto-initialization failed:', error);
});