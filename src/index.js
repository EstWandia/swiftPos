require('dotenv').config();
const app = require('./app');

const PORT = parseInt(process.env.PORT || '3000');

app.listen(PORT, () => {
  console.log(`\n⚡ SwiftPOS v2.0 running at http://localhost:${PORT}`);
  console.log(`   Mode        : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Database    : MySQL @ ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || 'swiftpos'}`);
  console.log(`   Press Ctrl+C to stop\n`);
});
