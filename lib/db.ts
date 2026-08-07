// Fachada de compatibilidad. El acceso real está separado en /database y /repositories.
export { initDb } from "@/database/init";
export * from "@/repositories";
