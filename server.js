const express = require('express');
const admin = require('firebase-admin');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const app = express();

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();
const ref = db.ref('watchlist');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// Authentication Middleware
const checkAuth = async (req, res, next) => {
  const sessionCookie = req.cookies.session || '';
  try {
    const decodedClaims = await admin.auth().verifySessionCookie(sessionCookie, true);
    req.user = decodedClaims;
    next();
  } catch (error) {
    res.redirect('/login');
  }
};

// Case Number Generator (SS-XXXX)
const generateCaseNumber = async () => {
  const snapshot = await ref.once('value');
  const count = snapshot.numChildren() + 1;
  return `SS-${String(count).padStart(4, '0')}`;
};

// --- AUTH ROUTES ---
app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/api/login', async (req, res) => {
  const { idToken } = req.body;
  const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days

  try {
    const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });
    res.cookie('session', sessionCookie, { maxAge: expiresIn, httpOnly: true, secure: true });
    res.status(200).json({ status: 'success' });
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized request' });
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('session');
  res.redirect('/login');
});

// --- DASHBOARD ROUTES ---
app.get('/', checkAuth, async (req, res) => {
  try {
    const snapshot = await ref.once('value');
    const data = snapshot.val() || {};
    const watchlist = Object.keys(data).map(key => ({
      id: key,
      ...data[key]
    }));
    res.render('index', { watchlist });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error loading database records.');
  }
});

app.post('/api/watchlist', checkAuth, async (req, res) => {
  try {
    const { discordUsername, discordId, reason, priority } = req.body;
    
    if (!discordUsername || !discordId || !reason || !priority) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const caseNumber = await generateCaseNumber();

    const newEntry = {
      caseNumber,
      discordUsername,
      discordId,
      reason,
      priority,
      createdAt: new Date().toISOString()
    };

    await ref.push(newEntry);
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to add entry.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
