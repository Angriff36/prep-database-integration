import { createClient as w } from "@supabase/supabase-js";
const n = w(
  "",
  "",
  {
    auth: {
      persistSession: !0,
      autoRefreshToken: !0,
      detectSessionInUrl: !0
    }
  }
);
typeof window < "u" && (window.__SUPABASE_DEBUG__ = {
  hasUrl: !1,
  hasKey: !1,
  url: "",
  keyPrefix: "".slice(0, 6)
}, console.log("[Supabase env]", window.__SUPABASE_DEBUG__));
const d = class d {
  // Initialize the service and set up auth listener
  static async initialize() {
    if (!this.isInitialized)
      try {
        const { data: { session: t } } = await n.auth.getSession();
        this.currentUser = (t == null ? void 0 : t.user) || null, n.auth.onAuthStateChange((r, e) => {
          this.currentUser = (e == null ? void 0 : e.user) || null, this.userProfile = null, this.connectionPromise = null, console.log(`[DatabaseService] Auth state changed: ${r}`);
        }), this.isInitialized = !0, console.log("[DatabaseService] Initialized successfully");
      } catch (t) {
        throw console.error("[DatabaseService] Initialization failed:", t), t;
      }
  }
  // Get or create user profile
  static async ensureUserProfile() {
    var t;
    if (!this.currentUser) return null;
    if (this.userProfile) return this.userProfile;
    try {
      const { data: r, error: e } = await n.from("user_profiles").select("*").eq("id", this.currentUser.id).single();
      if (r && !e)
        return this.userProfile = r, this.userProfile;
      const s = {
        id: this.currentUser.id,
        email: this.currentUser.email,
        full_name: ((t = this.currentUser.user_metadata) == null ? void 0 : t.full_name) || null,
        role: "user"
      }, { data: i, error: a } = await n.from("user_profiles").upsert(s, { onConflict: "id" }).select().single();
      return a ? (console.error("[DatabaseService] Failed to create user profile:", a), null) : (this.userProfile = i, this.userProfile);
    } catch (r) {
      return console.error("[DatabaseService] Error ensuring user profile:", r), null;
    }
  }
  // Improved connection testing with proper error handling
  static async testConnection() {
    return this.connectionPromise ? this.connectionPromise : (this.connectionPromise = this._performConnectionTest(), this.connectionPromise);
  }
  static async _performConnectionTest() {
    var t, r;
    try {
      return await this.initialize(), console.error("[DatabaseService] Missing Supabase configuration"), !1;
      const { data: e, error: s } = await n.from("prep_lists").select("id").limit(1);
      if (s)
        if (s.code === "42501" || (t = s.message) != null && t.includes("RLS")) {
          console.warn("[DatabaseService] RLS policy restricting access (this is expected for unauthenticated users)");
          try {
            const { data: { session: i } } = await n.auth.getSession();
            return console.log("[DatabaseService] Connection successful, RLS policies active", {
              authenticated: !!i,
              user: ((r = i == null ? void 0 : i.user) == null ? void 0 : r.email) || "anonymous"
            }), !0;
          } catch (i) {
            return console.error("[DatabaseService] Authentication check failed:", i), !1;
          }
        } else
          return console.error("[DatabaseService] Connection test failed:", s), !1;
      return console.log("[DatabaseService] Connection test successful"), !0;
    } catch (e) {
      return console.error("[DatabaseService] Connection test error:", e), !1;
    }
  }
  // Enhanced error handling wrapper
  static async executeWithErrorHandling(t, r) {
    var e, s, i;
    try {
      if (!await this.testConnection())
        throw new Error("Database connection not available. Please check your Supabase configuration.");
      return this.currentUser && await this.ensureUserProfile(), await r();
    } catch (a) {
      throw console.error(`[DatabaseService:${t}] Operation failed:`, {
        error: a.message,
        code: a.code,
        details: a.details,
        hint: a.hint,
        user: ((e = this.currentUser) == null ? void 0 : e.id) || "unauthenticated"
      }), a.code === "42P01" ? new Error("Table not found. Please ensure database migrations have been run.") : a.code === "42501" || (s = a.message) != null && s.includes("RLS") ? new Error("Access denied. Please check Row Level Security policies or authentication.") : a.code === "23505" ? new Error("Duplicate entry detected. This item may already exist.") : (i = a.message) != null && i.includes("JWT") ? new Error("Authentication token invalid. Please refresh and try again.") : a;
    }
  }
  // Prep Lists with improved error handling
  static async savePrepList(t) {
    return this.executeWithErrorHandling("savePrepList", async () => {
      var i;
      if (!t.id || !((i = t.name) != null && i.trim()))
        throw new Error("Prep list must have a valid ID and name");
      if (!this.currentUser)
        throw new Error("Authentication required to save prep lists");
      const r = {
        id: t.id,
        name: t.name.trim(),
        items: Array.isArray(t.items) ? t.items : [],
        company_id: t.company_id || null,
        user_id: this.currentUser.id
      }, { data: e, error: s } = await n.from("prep_lists").upsert(r, {
        onConflict: "id",
        ignoreDuplicates: !1
      }).select().single();
      if (s) throw s;
      return {
        id: e.id,
        name: e.name,
        items: e.items || [],
        company_id: e.company_id,
        created_at: e.created_at,
        updated_at: e.updated_at
      };
    });
  }
  static async loadPrepLists() {
    return this.executeWithErrorHandling("loadPrepLists", async () => {
      this.currentUser || console.warn("[DatabaseService] Loading prep lists without authentication - may return empty results due to RLS");
      const { data: t, error: r } = await n.from("prep_lists").select("*").order("created_at", { ascending: !1 });
      if (r) throw r;
      return (t || []).filter((e) => e && e.id && e.name).map((e) => ({
        id: e.id,
        name: e.name,
        items: Array.isArray(e.items) ? e.items : [],
        company_id: e.company_id,
        created_at: e.created_at,
        updated_at: e.updated_at
      }));
    });
  }
  static async deletePrepList(t) {
    return this.executeWithErrorHandling("deletePrepList", async () => {
      if (!(t != null && t.trim()))
        throw new Error("Valid ID required for deletion");
      const { error: r } = await n.from("prep_lists").delete().eq("id", t.trim());
      if (r) throw r;
    });
  }
  // Events with improved error handling
  static async saveEvent(t) {
    return this.executeWithErrorHandling("saveEvent", async () => {
      var i;
      if (!t.id || !((i = t.name) != null && i.trim()) || !t.date)
        throw new Error("Event must have valid ID, name, and date");
      if (!this.currentUser)
        throw new Error("Authentication required to save events");
      const r = {
        id: t.id,
        name: t.name.trim(),
        date: t.date,
        invoice_number: t.invoiceNumber || null,
        prep_items: Array.isArray(t.prepItems) ? t.prepItems : [],
        status: t.status || "planning",
        total_servings: Number(t.totalServings) || 0,
        company_id: t.company_id || null,
        user_id: this.currentUser.id
      }, { data: e, error: s } = await n.from("events").upsert(r, {
        onConflict: "id",
        ignoreDuplicates: !1
      }).select().single();
      if (s) throw s;
      return {
        id: e.id,
        name: e.name,
        date: e.date,
        invoiceNumber: e.invoice_number,
        prepItems: e.prep_items || [],
        status: e.status,
        totalServings: e.total_servings || 0,
        company_id: e.company_id,
        created_at: e.created_at,
        updated_at: e.updated_at
      };
    });
  }
  static async loadEvents() {
    return this.executeWithErrorHandling("loadEvents", async () => {
      this.currentUser || console.warn("[DatabaseService] Loading events without authentication - may return empty results due to RLS");
      const { data: t, error: r } = await n.from("events").select("*").order("date", { ascending: !1 });
      if (r) throw r;
      return (t || []).filter((e) => e && e.id && e.name).map((e) => ({
        id: e.id,
        name: e.name,
        date: e.date,
        invoiceNumber: e.invoice_number,
        prepItems: Array.isArray(e.prep_items) ? e.prep_items : [],
        status: e.status || "planning",
        totalServings: Number(e.total_servings) || 0,
        company_id: e.company_id,
        created_at: e.created_at,
        updated_at: e.updated_at
      }));
    });
  }
  // Recipes with improved validation
  static async saveRecipe(t) {
    return this.executeWithErrorHandling("saveRecipe", async () => {
      var i, a, o, l, c;
      if (!t.id || !((i = t.name) != null && i.trim()))
        throw new Error("Recipe must have valid ID and name");
      if (!this.currentUser)
        throw new Error("Authentication required to save recipes");
      const r = {
        id: t.id,
        name: t.name.trim(),
        description: ((a = t.description) == null ? void 0 : a.trim()) || null,
        ingredients: Array.isArray(t.ingredients) ? t.ingredients : [],
        instructions: Array.isArray(t.instructions) ? t.instructions : [],
        yield: ((o = t.yield) == null ? void 0 : o.trim()) || null,
        prep_time: Number(t.prepTime) || null,
        cook_time: Number(t.cookTime) || null,
        total_time: Number(t.totalTime) || null,
        difficulty: t.difficulty || "Medium",
        tags: Array.isArray(t.tags) ? t.tags : [],
        notes: ((l = t.notes) == null ? void 0 : l.trim()) || null,
        image: ((c = t.image) == null ? void 0 : c.trim()) || null,
        company_id: t.company_id || null,
        user_id: this.currentUser.id
      }, { data: e, error: s } = await n.from("recipes").upsert(r, {
        onConflict: "id",
        ignoreDuplicates: !1
      }).select().single();
      if (s) throw s;
      return {
        id: e.id,
        name: e.name,
        description: e.description,
        ingredients: e.ingredients || [],
        instructions: e.instructions || [],
        yield: e.yield,
        prepTime: e.prep_time,
        cookTime: e.cook_time,
        totalTime: e.total_time,
        difficulty: e.difficulty,
        tags: e.tags || [],
        notes: e.notes,
        image: e.image,
        company_id: e.company_id,
        createdAt: e.created_at,
        updatedAt: e.updated_at
      };
    });
  }
  static async loadRecipes() {
    return this.executeWithErrorHandling("loadRecipes", async () => {
      this.currentUser || console.warn("[DatabaseService] Loading recipes without authentication - may return empty results due to RLS");
      const { data: t, error: r } = await n.from("recipes").select("*").order("created_at", { ascending: !1 });
      if (r) throw r;
      return (t || []).filter((e) => e && e.id && e.name).map((e) => ({
        id: e.id,
        name: e.name,
        description: e.description,
        ingredients: Array.isArray(e.ingredients) ? e.ingredients : [],
        instructions: Array.isArray(e.instructions) ? e.instructions : [],
        yield: e.yield,
        prepTime: e.prep_time,
        cookTime: e.cook_time,
        totalTime: e.total_time,
        difficulty: e.difficulty || "Medium",
        tags: Array.isArray(e.tags) ? e.tags : [],
        notes: e.notes,
        image: e.image,
        company_id: e.company_id,
        createdAt: e.created_at,
        updatedAt: e.updated_at
      }));
    });
  }
  // Method and Container operations (similar pattern)
  static async saveMethod(t) {
    return this.executeWithErrorHandling("saveMethod", async () => {
      var i, a, o, l;
      if (!t.id || !((i = t.name) != null && i.trim()))
        throw new Error("Method must have valid ID and name");
      if (!this.currentUser)
        throw new Error("Authentication required to save methods");
      const r = {
        id: t.id,
        name: t.name.trim(),
        description: ((a = t.description) == null ? void 0 : a.trim()) || null,
        category: ((o = t.category) == null ? void 0 : o.trim()) || null,
        video_url: ((l = t.videoUrl) == null ? void 0 : l.trim()) || null,
        instructions: Array.isArray(t.instructions) ? t.instructions : [],
        estimated_time: Number(t.estimatedTime) || null,
        difficulty_level: t.difficultyLevel || "Intermediate",
        tags: Array.isArray(t.tags) ? t.tags : [],
        equipment: Array.isArray(t.equipment) ? t.equipment : [],
        tips: Array.isArray(t.tips) ? t.tips : [],
        company_id: t.company_id || null,
        user_id: this.currentUser.id
      }, { data: e, error: s } = await n.from("methods").upsert(r, { onConflict: "id" }).select().single();
      if (s) throw s;
      return {
        id: e.id,
        name: e.name,
        description: e.description,
        category: e.category,
        videoUrl: e.video_url,
        instructions: e.instructions || [],
        estimatedTime: e.estimated_time,
        difficultyLevel: e.difficulty_level,
        tags: e.tags || [],
        equipment: e.equipment || [],
        tips: e.tips || [],
        company_id: e.company_id,
        createdAt: e.created_at,
        updatedAt: e.updated_at
      };
    });
  }
  static async loadMethods() {
    return this.executeWithErrorHandling("loadMethods", async () => {
      this.currentUser || console.warn("[DatabaseService] Loading methods without authentication - may return empty results due to RLS");
      const { data: t, error: r } = await n.from("methods").select("*").order("created_at", { ascending: !1 });
      if (r) throw r;
      return (t || []).filter((e) => e && e.id && e.name).map((e) => ({
        id: e.id,
        name: e.name,
        description: e.description,
        category: e.category,
        videoUrl: e.video_url,
        instructions: Array.isArray(e.instructions) ? e.instructions : [],
        estimatedTime: e.estimated_time,
        difficultyLevel: e.difficulty_level || "Intermediate",
        tags: Array.isArray(e.tags) ? e.tags : [],
        equipment: Array.isArray(e.equipment) ? e.equipment : [],
        tips: Array.isArray(e.tips) ? e.tips : [],
        company_id: e.company_id,
        createdAt: e.created_at,
        updatedAt: e.updated_at
      }));
    });
  }
  // Enhanced connection diagnostics
  static async diagnoseConnection() {
    var r;
    const t = {
      configured: !1,
      accessible: !1,
      authenticated: !1,
      tables: [],
      errors: [],
      user: null,
      userProfile: null,
      rlsStatus: {}
    };
    try {
      if (t.errors.push("VITE_SUPABASE_URL not configured"), t.errors.push("VITE_SUPABASE_ANON_KEY not configured"), t.configured = !1, t.configured) {
        const { data: { session: i }, error: a } = await n.auth.getSession();
        a ? t.errors.push(`Auth error: ${a.message}`) : i && (t.authenticated = !0, t.user = {
          id: i.user.id,
          email: i.user.email,
          role: i.user.role
        }, t.userProfile = await this.ensureUserProfile());
        const o = ["user_profiles", "prep_lists", "events", "recipes", "methods", "containers"];
        for (const c of o)
          try {
            const { data: h, error: u } = await n.from(c).select("id").limit(1);
            u ? u.code === "42501" || (r = u.message) != null && r.includes("RLS") ? (t.errors.push(`Table '${c}': RLS policy active (${t.authenticated ? "user authenticated" : "no authentication"})`), t.tables.push(`${c} (RLS active)`), t.accessible = !0) : t.errors.push(`Table '${c}': ${u.message}`) : (t.tables.push(c), t.accessible = !0);
          } catch (h) {
            t.errors.push(`Table '${c}': ${h instanceof Error ? h.message : "Unknown error"}`);
          }
        const l = [
          { table: "user_profiles", schema: "public" },
          { table: "prep_lists", schema: "public" },
          { table: "events", schema: "public" },
          { table: "recipes", schema: "public" },
          { table: "methods", schema: "public" },
          { table: "containers", schema: "public" }
        ];
        for (const { table: c, schema: h } of l)
          try {
            const { data: u } = await n.from("pg_class").select("relname, relrowsecurity").eq("relname", c).single(), g = (u == null ? void 0 : u.relrowsecurity) || !1, { data: y } = await n.from("pg_policies").select("policyname, permissive, roles, cmd").eq("schemaname", h).eq("tablename", c);
            t.rlsStatus[c] = {
              enabled: g,
              policies: (y || []).map((f) => `${f.cmd}: ${f.policyname}`)
            };
          } catch {
            t.rlsStatus[c] = {
              enabled: !1,
              policies: ["Unable to check policies"]
            };
          }
      }
    } catch (e) {
      t.errors.push(`Connection diagnosis failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
    return this.connectionPromise = null, t;
  }
  // RLS testing utilities
  static async testRLSPolicies() {
    const t = {
      authenticated: !!this.currentUser,
      tables: {}
    }, r = ["prep_lists", "events", "recipes", "methods", "containers"];
    for (const e of r) {
      t.tables[e] = {
        canRead: !1,
        canInsert: !1,
        canUpdate: !1,
        canDelete: !1,
        errors: []
      };
      try {
        await n.from(e).select("id").limit(1), t.tables[e].canRead = !0;
      } catch (s) {
        t.tables[e].errors.push(`Read: ${s.message}`);
      }
      if (this.currentUser) {
        const s = `rls-test-${Date.now()}`;
        try {
          let i;
          switch (e) {
            case "prep_lists":
              i = { id: s, name: "RLS Test List", items: [] };
              break;
            case "events":
              i = { id: s, name: "RLS Test Event", date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0], status: "planning", total_servings: 0 };
              break;
            case "recipes":
              i = { id: s, name: "RLS Test Recipe", ingredients: [], instructions: [] };
              break;
            case "methods":
              i = { id: s, name: "RLS Test Method", instructions: [] };
              break;
            case "containers":
              i = { id: s, name: "RLS Test Container", type: "test" };
              break;
            default:
              continue;
          }
          const { error: a } = await n.from(e).insert(i);
          if (a)
            t.tables[e].errors.push(`Insert: ${a.message}`);
          else {
            t.tables[e].canInsert = !0;
            try {
              const { error: o } = await n.from(e).update({ name: "RLS Test Updated" }).eq("id", s);
              o || (t.tables[e].canUpdate = !0);
            } catch (o) {
              t.tables[e].errors.push(`Update: ${o.message}`);
            }
            try {
              const { error: o } = await n.from(e).delete().eq("id", s);
              o || (t.tables[e].canDelete = !0);
            } catch (o) {
              t.tables[e].errors.push(`Delete: ${o.message}`);
            }
          }
        } catch (i) {
          t.tables[e].errors.push(`Insert: ${i.message}`);
        }
      }
    }
    return t;
  }
  // User Profile Management
  static async getUserProfile() {
    if (!this.currentUser) return null;
    try {
      return await this.ensureUserProfile();
    } catch (t) {
      return console.error("[DatabaseService] Failed to get user profile:", t), null;
    }
  }
  static async updateUserProfile(t) {
    if (!this.currentUser)
      throw new Error("Authentication required to update profile");
    return this.executeWithErrorHandling("updateUserProfile", async () => {
      const { data: r, error: e } = await n.from("user_profiles").update({
        full_name: t.full_name,
        company_id: t.company_id,
        avatar_url: t.avatar_url
      }).eq("id", this.currentUser.id).select().single();
      if (e) throw e;
      return this.userProfile = r, r;
    });
  }
  // Auth helpers with better error handling
  static async signUp(t, r, e) {
    try {
      const { data: s, error: i } = await n.auth.signUp({
        email: t,
        password: r,
        options: {
          data: {
            full_name: (e == null ? void 0 : e.fullName) || null
          }
        }
      });
      return i ? (console.error("[DatabaseService] Sign up failed:", i), { success: !1, error: i.message }) : (s.user && await this.ensureUserProfile(), this.connectionPromise = null, { success: !0 });
    } catch (s) {
      return console.error("[DatabaseService] Sign up error:", s), { success: !1, error: s.message || "Unknown error during sign up" };
    }
  }
  static async signIn(t, r) {
    try {
      const { data: e, error: s } = await n.auth.signInWithPassword({
        email: t,
        password: r
      });
      return s ? (console.error("[DatabaseService] Sign in failed:", s), { success: !1, error: s.message }) : (e.user && (this.currentUser = e.user, await this.ensureUserProfile()), this.connectionPromise = null, { success: !0 });
    } catch (e) {
      return console.error("[DatabaseService] Sign in error:", e), { success: !1, error: e.message || "Unknown error during sign in" };
    }
  }
  static async signOut() {
    try {
      const { error: t } = await n.auth.signOut();
      return t ? { success: !1, error: t.message } : (this.currentUser = null, this.userProfile = null, this.connectionPromise = null, { success: !0 });
    } catch (t) {
      return console.error("[DatabaseService] Sign out error:", t), { success: !1, error: t.message || "Unknown error during sign out" };
    }
  }
  // Legacy method for backward compatibility  
  static async signIn_legacy(t, r) {
    return (await this.signIn(t, r)).success;
  }
  static getCurrentUser() {
    return this.currentUser;
  }
  static getCurrentUserProfile() {
    return this.userProfile;
  }
  // Company management helpers
  static async getUsersByCompany(t) {
    if (!this.currentUser)
      throw new Error("Authentication required");
    return this.executeWithErrorHandling("getUsersByCompany", async () => {
      const { data: r, error: e } = await n.from("user_profiles").select("*").eq("company_id", t);
      if (e) throw e;
      return r || [];
    });
  }
  // Real-time subscription testing
  static createRealtimeChannel(t, r) {
    try {
      return n.channel(`public:${t}`).on("postgres_changes", {
        event: "*",
        schema: "public",
        table: t
      }, r).subscribe((s) => {
        console.log(`[DatabaseService] Realtime channel for '${t}': ${s}`);
      });
    } catch (e) {
      throw console.error(`[DatabaseService] Failed to create realtime channel for '${t}':`, e), e;
    }
  }
  // Improved bulk operations
  static async createTestData(t = {}) {
    return this.executeWithErrorHandling("createTestData", async () => {
      var i;
      if (t.includeAuth && !this.currentUser) {
        const a = t.testEmail || "test@prepchef.com", o = t.testPassword || "test123456";
        if (console.log("[DatabaseService] Creating test user for data creation..."), !(await this.signUp(a, o, { fullName: "Test User" })).success) {
          const c = await this.signIn(a, o);
          if (!c.success)
            throw new Error(`Failed to authenticate test user: ${c.error}`);
        }
      }
      if (!this.currentUser)
        throw new Error("Authentication required to create test data");
      const r = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-"), e = {
        prepLists: [
          {
            id: `test-prep-list-${r}`,
            name: `Test Prep List ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`,
            items: [
              { id: "1", name: "Test Item 1", quantity: "5", unit: "lbs" },
              { id: "2", name: "Test Item 2", quantity: "10", unit: "pieces" }
            ]
          }
        ],
        events: [
          {
            id: `test-event-${r}`,
            name: `Test Event ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`,
            date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
            status: "planning",
            totalServings: 50,
            prepItems: []
          }
        ],
        recipes: [
          {
            id: `test-recipe-${r}`,
            name: `Test Recipe ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`,
            description: "A test recipe for debugging",
            ingredients: ["Test ingredient 1", "Test ingredient 2"],
            instructions: ["Test instruction 1", "Test instruction 2"],
            difficulty: "Easy"
          }
        ],
        methods: [
          {
            id: `test-method-${r}`,
            name: `Test Method ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`,
            description: "A test cooking method",
            instructions: ["Step 1", "Step 2"],
            difficultyLevel: "Beginner"
          }
        ],
        containers: [
          {
            id: `test-container-${r}`,
            name: `Test Container ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`,
            type: "storage",
            size: "medium"
          }
        ]
      };
      for (const a of e.prepLists)
        await this.savePrepList(a);
      for (const a of e.events)
        await this.saveEvent(a);
      for (const a of e.recipes)
        await this.saveRecipe(a);
      for (const a of e.methods)
        await this.saveMethod(a);
      const s = e.containers.map(async (a) => {
        var l;
        const { error: o } = await n.from("containers").insert({
          id: a.id,
          name: a.name,
          type: a.type,
          size: a.size,
          user_id: (l = this.currentUser) == null ? void 0 : l.id
        });
        if (o) throw o;
      });
      await Promise.all(s), console.log("[DatabaseService] Test data created successfully", {
        prepLists: e.prepLists.length,
        events: e.events.length,
        recipes: e.recipes.length,
        methods: e.methods.length,
        containers: e.containers.length,
        user: (i = this.currentUser) == null ? void 0 : i.email
      });
    });
  }
  static async cleanupTestData() {
    return this.executeWithErrorHandling("cleanupTestData", async () => {
      if (!this.currentUser)
        throw new Error("Authentication required to cleanup test data");
      const t = ["prep_lists", "events", "recipes", "methods", "containers"];
      let r = 0;
      for (const e of t) {
        const { data: s, error: i } = await n.from(e).select("id, name").ilike("name", "Test %").eq("user_id", this.currentUser.id);
        if (i) {
          console.warn(`Failed to fetch test items from ${e}:`, i);
          continue;
        }
        if (s && s.length > 0) {
          const a = s.map((l) => l.id), { error: o } = await n.from(e).delete().in("id", a);
          o ? console.warn(`Failed to delete test items from ${e}:`, o) : (r += s.length, console.log(`Cleaned up ${s.length} test items from ${e}`));
        }
      }
      console.log(`[DatabaseService] Test data cleanup completed - deleted ${r} items`);
    });
  }
};
d.isInitialized = !1, d.connectionPromise = null, d.currentUser = null, d.userProfile = null;
let m = d;
m.initialize().catch((p) => {
  console.error("[DatabaseService] Auto-initialization failed:", p);
});
export {
  m as DatabaseService,
  n as supabase
};
