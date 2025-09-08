export const fetchCategories = async () => fetch("/api/categories").then(r => r.json());
export const addCategory = async (formData) => fetch("/api/categories/upload", { method: "POST", body: formData });
export const removeCategory = async (rowNumber) =>
  fetch("/api/categories", { method: "POST", body: JSON.stringify({ rowNumber, action: "remove" }), headers: { "Content-Type": "application/json" } });

export const fetchAdmins = async () => fetch("/api/admins").then(r => r.json());
export const addAdmin = async (userId) => fetch("/api/admins/add", { method: "POST", body: JSON.stringify({ userId }), headers: { "Content-Type": "application/json" } });
export const removeAdmin = async (userId) => fetch("/api/admins/remove", { method: "POST", body: JSON.stringify({ userId }), headers: { "Content-Type": "application/json" } });
