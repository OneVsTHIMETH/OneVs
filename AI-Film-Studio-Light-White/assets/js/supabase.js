// Browser-safe Supabase client. Only the anon/publishable key belongs here.
window.StudioDB = {
  client: null,
  user: null,
  async init(url, anonKey) {
    if (!window.supabase || !url || !anonKey) return false;
    this.client = window.supabase.createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const { data } = await this.client.auth.getSession();
    this.user = data.session?.user || null;
    this.client.auth.onAuthStateChange((_event, session) => {
      this.user = session?.user || null;
      window.dispatchEvent(new CustomEvent("studio-auth-change", { detail: { user: this.user } }));
    });
    return true;
  },
  get connected() { return !!this.client; },
  get signedIn() { return !!this.user; },
  async uploadPrivate(bucket, path, file) {
    if (!this.user) throw new Error("Please sign in first.");
    const safePath = `${this.user.id}/${path}`;
    const { error } = await this.client.storage.from(bucket).upload(safePath, file, { upsert: false });
    if (error) throw error;
    return safePath;
  },
  async signedUrl(bucket, path) {
    if (!path) return "";
    const { data, error } = await this.client.storage.from(bucket).createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  }
};
