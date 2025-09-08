+ export async function checkAdmin(userId){
+   const r = await fetch(`/api/checkAdmin?userId=${encodeURIComponent(userId)}`);
+   if(!r.ok) return { ok:false, isAdmin:false };
+   return r.json();
+ }
