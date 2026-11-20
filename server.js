require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ---------- Existing routes (categories, products, etc.) ----------
app.get('/api/categories', async (req, res) => {
    const { data, error } = await supabase.from('categories').select('id, name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/categories/:id', async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('categories').select('id, name').eq('id', id).single();
    if (error) return res.status(404).json({ error: 'Category not found' });
    res.json(data);
});

app.get('/api/products', async (req, res) => {
    const { category } = req.query;
    const query = supabase.from('products').select('id, name, description, price, category_id');
    const { data, error } = category ? await query.eq('category_id', category) : await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// ---------- Admin Login ----------
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    const { data, error } = await supabase
        .from('admins')
        .select('id, password_hash')
        .eq('username', username)
        .single();

    if (error || !data) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Simple plain‑text compare for demo – **replace with proper hashing** in prod
    if (data.password_hash !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Return minimal info (you can add JWT later)
    res.json({ message: 'Login successful', adminId: data.id });
});

// ---------- Admin Signup ----------
app.post('/api/admin/signup', async (req, res) => {
    const { username, password } = req.body;

    // Check if user exists
    const { data: exists } = await supabase.from('admins').select('id')
        .eq('username', username).single();

    if (exists) {
        return res.status(400).json({ error: 'Username already taken' });
    }

    // For demo we store password as plain text – **NEVER** in production
    const { data, error } = await supabase.from('admins')
        .insert({ username, password_hash: password })
        .single();

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.json({ message: 'Signup successful', adminId: data.id });
});

// ---------- Remove old WhatsApp / Call routes (if any) ----------
/* 
   If you previously had routes like /api/whatsapp or /api/call,
   simply delete/disable them. They are not needed any more.
*/

// ---------- Start server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
