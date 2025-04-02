require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.log('MongoDB connection error:', err);
    console.log('Running in development mode without database');
  }
};

connectDB();

// In-memory storage for development when MongoDB is unavailable
const inMemoryUsers = [];
const inMemoryMessages = [];
const inMemoryGroups = [
  {
    id: 'everyone',
    name: 'Everyone',
    description: 'Public group for all users',
    members: [], // Will be populated with all users
  }
];

// Add a demo user for testing
const createDemoUser = async () => {
  try {
    console.log('Attempting to create demo user');
    // Check if demo user already exists
    let demoUser;
    
    try {
      demoUser = await User.findOne({ username: 'demo' });
      if (demoUser) {
        console.log('Demo user already exists in database');
        return;
      }
    } catch (dbError) {
      console.log('Database error when checking for demo user:', dbError.message);
      // If database is unavailable, check in-memory
      demoUser = inMemoryUsers.find(u => u.username === 'demo');
      if (demoUser) {
        console.log('Demo user already exists in memory');
        return;
      }
    }
    
    // If we're here, demo user doesn't exist yet
    console.log('Creating new demo user');
    
    // Create demo user
    const hashedPassword = await bcrypt.hash('demo123', 10);
    
    try {
      demoUser = new User({ 
        username: 'demo', 
        password: hashedPassword 
      });
      await demoUser.save();
      console.log('Demo user created and saved in database');
    } catch (dbError) {
      console.log('Database error when saving demo user:', dbError.message);
      // If database is unavailable, store in-memory
      const newUser = { 
        id: 'demo-user',
        username: 'demo', 
        password: hashedPassword 
      };
      
      // Make sure we don't duplicate the demo user in memory
      const existingIndex = inMemoryUsers.findIndex(u => u.username === 'demo');
      if (existingIndex >= 0) {
        inMemoryUsers[existingIndex] = newUser;
        console.log('Demo user updated in memory');
      } else {
        inMemoryUsers.push(newUser);
        console.log('Demo user created in memory');
      }
      
      // Log the current in-memory users for debugging
      console.log('Current in-memory users:', inMemoryUsers.map(u => u.username));
    }
  } catch (error) {
    console.error('Error creating demo user:', error);
  }
};

// User Schema
let User;
try {
  User = mongoose.model('User');
} catch (error) {
  const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
  });
  User = mongoose.model('User', UserSchema);
}

// Message Schema
let Message;
try {
  Message = mongoose.model('Message');
} catch (error) {
  const MessageSchema = new mongoose.Schema({
    senderId: { type: String, required: true },
    recipientId: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    isGroupMessage: { type: Boolean, default: false },
  });
  Message = mongoose.model('Message', MessageSchema);
}

// Group Schema
let Group;
try {
  Group = mongoose.model('Group');
} catch (error) {
  const GroupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    members: [{ type: String }], // User IDs
    createdAt: { type: Date, default: Date.now },
  });
  Group = mongoose.model('Group', GroupSchema);
}

// Authentication middleware
const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

// Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Check if user exists
    let user;
    
    try {
      user = await User.findOne({ username });
    } catch (dbError) {
      // If database is unavailable, check in-memory
      user = inMemoryUsers.find(u => u.username === username);
    }
    
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    try {
      user = new User({ username, password: hashedPassword });
      await user.save();
    } catch (dbError) {
      // If database is unavailable, store in-memory
      const newUser = { 
        id: Date.now().toString(),
        username, 
        password: hashedPassword 
      };
      inMemoryUsers.push(newUser);
      user = newUser;
    }
    
    // Generate token
    const token = jwt.sign(
      { id: user.id || user._id, username: user.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );
    
    res.status(201).json({ 
      token,
      userId: user.id || user._id,
      username: user.username
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log(`Login attempt for user: ${username}`);
    
    // Check if user exists
    let user;
    
    try {
      user = await User.findOne({ username });
      console.log(`Database user lookup for ${username}: ${user ? 'found' : 'not found'}`);
    } catch (dbError) {
      console.log(`Database error when looking up user ${username}:`, dbError.message);
      // If database is unavailable, check in-memory
      user = inMemoryUsers.find(u => u.username === username);
      console.log(`In-memory user lookup for ${username}: ${user ? 'found' : 'not found'}`);
      console.log('Available in-memory users:', inMemoryUsers.map(u => u.username));
    }
    
    if (!user) {
      console.log(`Login failed: User ${username} not found`);
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      console.log(`Login failed: Invalid password for user ${username}`);
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Generate token
    const userId = user.id || user._id;
    const token = jwt.sign(
      { id: userId, username: user.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );
    
    console.log(`Login successful for user ${username} (ID: ${userId})`);
    
    res.json({ 
      token,
      userId,
      username: user.username
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get all users
app.get('/api/users', authenticateJWT, async (req, res) => {
  try {
    let users;
    
    try {
      users = await User.find().select('-password');
    } catch (dbError) {
      // If database is unavailable, use in-memory
      users = inMemoryUsers.map(u => ({ 
        id: u.id, 
        username: u.username 
      }));
    }
    
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all groups
app.get('/api/groups', authenticateJWT, async (req, res) => {
  try {
    let groups;
    
    try {
      groups = await Group.find();
    } catch (dbError) {
      // If database is unavailable, use in-memory
      groups = inMemoryGroups;
    }
    
    res.json(groups);
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new group
app.post('/api/groups', authenticateJWT, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Group name is required' });
    }
    
    let group;
    
    try {
      group = new Group({
        name,
        description,
        members: [req.user.id], // Add creator as first member
      });
      await group.save();
    } catch (dbError) {
      // If database is unavailable, store in-memory
      const newGroup = {
        id: Date.now().toString(),
        name,
        description,
        members: [req.user.id],
        createdAt: new Date(),
      };
      inMemoryGroups.push(newGroup);
      group = newGroup;
    }
    
    res.status(201).json(group);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Join a group
app.post('/api/groups/:groupId/join', authenticateJWT, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    let group;
    
    try {
      group = await Group.findById(groupId);
      if (!group) {
        return res.status(404).json({ message: 'Group not found' });
      }
      
      if (!group.members.includes(req.user.id)) {
        group.members.push(req.user.id);
        await group.save();
      }
    } catch (dbError) {
      // If database is unavailable, use in-memory
      group = inMemoryGroups.find(g => g.id === groupId);
      if (!group) {
        return res.status(404).json({ message: 'Group not found' });
      }
      
      if (!group.members.includes(req.user.id)) {
        group.members.push(req.user.id);
      }
    }
    
    res.json(group);
  } catch (error) {
    console.error('Join group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Socket.io
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  
  if (!token) {
    return next(new Error('Authentication error'));
  }
  
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('New client connected');
  
  // Add user to connected users map
  connectedUsers.set(socket.user.id, {
    id: socket.user.id,
    username: socket.user.username,
    socketId: socket.id,
  });
  
  // Add user to everyone group if not already a member
  const everyoneGroup = inMemoryGroups.find(g => g.id === 'everyone');
  if (everyoneGroup && !everyoneGroup.members.includes(socket.user.id)) {
    everyoneGroup.members.push(socket.user.id);
  }
  
  // Emit connected users to everyone
  io.emit('users', Array.from(connectedUsers.values()));
  
  // Emit groups to current user
  socket.emit('groups', inMemoryGroups);
  
  // Handle private messages
  socket.on('private message', async (data) => {
    const { recipientId, content } = data;
    
    const message = {
      senderId: socket.user.id,
      senderUsername: socket.user.username,
      recipientId,
      content,
      timestamp: new Date(),
      isGroupMessage: false,
    };
    
    // Save message
    try {
      const newMessage = new Message({
        senderId: socket.user.id,
        recipientId,
        content,
        isGroupMessage: false,
      });
      await newMessage.save();
    } catch (error) {
      // If database is unavailable, store in-memory
      inMemoryMessages.push(message);
    }
    
    // Find recipient's socket
    const recipient = connectedUsers.get(recipientId);
    
    if (recipient) {
      io.to(recipient.socketId).emit('private message', message);
    }
    
    // Send to sender as well
    socket.emit('private message', message);
  });
  
  // Handle group messages
  socket.on('group message', async (data) => {
    const { groupId, content } = data;
    
    // Find the group
    let group;
    try {
      group = await Group.findById(groupId);
    } catch (dbError) {
      group = inMemoryGroups.find(g => g.id === groupId);
    }
    
    if (!group) {
      socket.emit('error', { message: 'Group not found' });
      return;
    }
    
    // Check if user is a member of the group
    if (!group.members.includes(socket.user.id)) {
      socket.emit('error', { message: 'You are not a member of this group' });
      return;
    }
    
    const message = {
      senderId: socket.user.id,
      senderUsername: socket.user.username,
      recipientId: groupId,
      content,
      timestamp: new Date(),
      isGroupMessage: true,
    };
    
    // Save message
    try {
      const newMessage = new Message({
        senderId: socket.user.id,
        recipientId: groupId,
        content,
        isGroupMessage: true,
      });
      await newMessage.save();
    } catch (error) {
      // If database is unavailable, store in-memory
      inMemoryMessages.push(message);
    }
    
    // Send message to all members of the group who are connected
    group.members.forEach(memberId => {
      const member = connectedUsers.get(memberId);
      if (member) {
        io.to(member.socketId).emit('group message', message);
      }
    });
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected');
    connectedUsers.delete(socket.user.id);
    io.emit('users', Array.from(connectedUsers.values()));
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve API documentation at the root
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>RTChat API</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #333; }
          h2 { color: #555; }
          pre { background: #f4f4f4; padding: 10px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1>RTChat API</h1>
        <p>Welcome to the RTChat server. The client application should be running on a different port.</p>
        
        <h2>Available Endpoints:</h2>
        <ul>
          <li><code>POST /api/register</code> - Register a new user</li>
          <li><code>POST /api/login</code> - Login a user</li>
          <li><code>GET /api/users</code> - Get all users (requires authentication)</li>
          <li><code>GET /api/groups</code> - Get all groups (requires authentication)</li>
          <li><code>POST /api/groups</code> - Create a new group (requires authentication)</li>
          <li><code>POST /api/groups/:groupId/join</code> - Join a group (requires authentication)</li>
          <li><code>GET /api/health</code> - Health check</li>
        </ul>
        
        <h2>Socket.IO Endpoints:</h2>
        <ul>
          <li><code>private message</code> - Send a private message</li>
          <li><code>group message</code> - Send a group message</li>
          <li><code>users</code> - Get connected users</li>
          <li><code>groups</code> - Get available groups</li>
        </ul>
        
        <h2>Demo Accounts:</h2>
        <p>Username: <code>demo</code><br>Password: <code>demo123</code></p>
        
        <p>To use the chat application, please visit the client application.</p>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 5000;

// Try to start the server, and try alternative ports if the default port is in use
const startServer = (port) => {
  try {
    server.listen(port, () => {
      console.log(`Server running on port ${port}`);
      // Update the .env file with the successful port
      if (port !== PORT) {
        console.log(`Default port ${PORT} was in use, server started on port ${port} instead`);
        console.log(`Update your client to use port ${port}`);
      }
      
      // Create demo user after server starts
      setTimeout(() => {
        console.log('Creating demo user...');
        createDemoUser();
      }, 500); // Slight delay to ensure MongoDB connection attempts have completed
    });
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      console.log(`Port ${port} is in use, trying port ${port + 1}`);
      startServer(port + 1);
    } else {
      console.error('Error starting server:', error);
    }
  }
};

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is in use, trying port ${PORT + 1}`);
    startServer(PORT + 1);
  } else {
    console.error('Server error:', error);
  }
});

startServer(PORT); 