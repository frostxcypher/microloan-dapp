// admin-backend/server.js
require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3001;

app.get('/api/health', (req, res) => {
    res.json({ status: 'Admin backend is running' });
});

app.listen(PORT, () => {
    console.log(`Admin backend server running on port ${PORT}`);
});