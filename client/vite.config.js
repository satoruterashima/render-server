import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'client', 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});
