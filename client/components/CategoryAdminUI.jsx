import { useState, useEffect } from "react";
import { fetchCategories, addCategory, removeCategory } from "../api/fetchAPI";

export default function CategoryAdminUI() {
  const [categories, setCategories] = useState([]);
  const [daibun, setDaibun] = useState("");
  const [chubun, setChubun] = useState("");
  const [shobun, setShobun] = useState("");
  const [price, setPrice] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => { loadCategories(); }, []);

  const loadCategories = async () => {
    const data = await fetchCategories();
    setCategories(data);
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    if (selectedFile) {
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result);
      reader.readAsDataURL(selectedFile);
    } else setPreview(null);
  };

  const addNewCategory = async () => {
    if (!daibun || !chubun || !shobun || !price || !file) return alert("全て入力してください");
    const formData = new FormData();
    formData.append("daibun", daibun);
    formData.append("chubun", chubun);
    formData.append("shobun", shobun);
    formData.append("price", price);
    formData.append("file", file);
    formData.append("action", "add");
    await addCategory(formData);
    setDaibun(""); setChubun(""); setShobun(""); setPrice(""); setFile(null); setPreview(null);
    loadCategories();
  };

  const removeCat = async (index) => {
    await removeCategory(index + 2);
    loadCategories();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">カテゴリ管理</h2>
      <div className="flex flex-col space-y-2">
        <input className="border rounded px-2 py-1" placeholder="大分類" value={daibun} onChange={e => setDaibun(e.target.value)} />
        <input className="border rounded px-2 py-1" placeholder="中分類" value={chubun} onChange={e => setChubun(e.target.value)} />
        <input className="border rounded px-2 py-1" placeholder="小分類" value={shobun} onChange={e => setShobun(e.target.value)} />
        <input className="border rounded px-2 py-1" placeholder="価格" type="number" value={price} onChange={e => setPrice(e.target.value)} />
        <input type="file" accept="image/*" onChange={handleFileChange} />
        {preview && <img src={preview} alt="preview" className="w-32 h-32 object-cover rounded border mt-1" />}
        <button onClick={addNewCategory} className="px-4 py-2 bg-blue-500 text-white rounded shadow mt-2">追加</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {categories.map((c, i) => (
          <div key={i} className="border rounded shadow p-2 flex flex-col items-center">
            <img src={c[4]} alt={c[2]} className="w-24 h-24 object-cover rounded mb-1" />
            <div className="text-sm font-medium">{c[0]} / {c[1]}</div>
            <div className="text-sm">{c[2]}</div>
            <div className="text-sm font-semibold">¥{c[3]}</div>
            <button onClick={() => removeCat(i)} className="mt-1 px-2 py-1 bg-red-500 text-white text-sm rounded">削除</button>
          </div>
        ))}
      </div>
    </div>
  );
}
