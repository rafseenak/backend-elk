const express = require('express');
const bodyParser = require('body-parser');
const userRoutes = require('./routes/userRoutes');
const sequelize = require('./config/db');
require('dotenv').config();
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());

app.use('/api', userRoutes);

app.get('/', (req, res) => {
  res.send('Welcome to the Node.js MySQL API');
}); 

sequelize.sync({ alter: false })
  .then(() => {
    console.log('Database synced successfully!');
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  }) 
  .catch(err => {
    console.error('Error syncing database:', err);
  });