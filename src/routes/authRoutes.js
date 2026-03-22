const express = require('express');
const router  = express.Router();
const AuthController = require('../controllers/authController');

router.get('/login',  AuthController.showLogin);
router.post('/login', AuthController.login);
router.get('/logout', AuthController.logout);

module.exports = router;
