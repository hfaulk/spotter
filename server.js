// Module Imports
import express from 'express'
import cookieParser from 'cookie-parser'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

// Controller Imports
import { serveLogin, serveRegister, registerUser, loginUser, googleAuth, authCallback, signOut } from './src/controllers/authController.js'

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());


// GET
app.get('/login', serveLogin)
app.get('/register', serveRegister)
app.get('/auth/google', googleAuth)
app.get('/auth/callback', authCallback)
app.get('/signout', signOut)

// POST
app.post('/register', registerUser)
app.post('/login', loginUser)


app.listen(3000, () => console.log('Spotter running on http://localhost:3000'));
