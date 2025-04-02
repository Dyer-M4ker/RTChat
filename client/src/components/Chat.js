import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Drawer,
  ListItemButton,
  Avatar,
  Tabs,
  Tab,
  Badge,
} from '@mui/material';
import {
  Send as SendIcon,
  ExitToApp as LogoutIcon,
  Menu as MenuIcon,
  Person as PersonIcon,
  Group as GroupIcon,
} from '@mui/icons-material';
import io from 'socket.io-client';
import axios from 'axios';

// API Configuration
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const Chat = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [groupMessages, setGroupMessages] = useState({});
  const [newMessage, setNewMessage] = useState('');
  const [socket, setSocket] = useState(null);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const messagesEndRef = useRef(null);
  const currentUser = {
    id: localStorage.getItem('userId'),
    username: localStorage.getItem('username'),
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedGroup]);

  // Fetch users from API
  const fetchUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await axios.get(`${API_URL}/api/users`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      // Filter out current user
      const filteredUsers = response.data.filter(
        user => user.id !== currentUser.id && user._id !== currentUser.id
      );
      
      setUsers(filteredUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, [currentUser.id]);

  // Fetch groups from API
  const fetchGroups = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await axios.get(`${API_URL}/api/groups`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      setGroups(response.data);
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    // Connect to socket with token for authentication
    const newSocket = io(API_URL, {
      auth: { token }
    });
    
    setSocket(newSocket);

    // Listen for users updates
    newSocket.on('users', (updatedUsers) => {
      // Filter out current user
      const filteredUsers = updatedUsers.filter(
        user => user.id !== currentUser.id
      );
      setUsers(filteredUsers);
    });

    // Listen for groups updates
    newSocket.on('groups', (updatedGroups) => {
      setGroups(updatedGroups);
    });

    // Listen for private messages
    newSocket.on('private message', (message) => {
      if (selectedUser && (message.senderId === selectedUser.id || message.recipientId === selectedUser.id)) {
        setMessages((prev) => [...prev, message]);
      }
    });

    // Listen for group messages
    newSocket.on('group message', (message) => {
      setGroupMessages(prev => {
        const groupId = message.recipientId;
        return {
          ...prev,
          [groupId]: [...(prev[groupId] || []), message]
        };
      });
      
      if (selectedGroup && selectedGroup.id === message.recipientId) {
        scrollToBottom();
      }
    });

    // Fetch initial users and groups
    fetchUsers();
    fetchGroups();

    return () => newSocket.close();
  }, [navigate, currentUser.id, fetchUsers, fetchGroups, selectedUser, selectedGroup]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    if (tabValue === 0 && selectedUser) {
      // Send private message
      const messageData = {
        recipientId: selectedUser.id || selectedUser._id,
        content: newMessage,
      };

      socket.emit('private message', messageData);
    } else if (tabValue === 1 && selectedGroup) {
      // Send group message
      const messageData = {
        groupId: selectedGroup.id,
        content: newMessage,
      };

      socket.emit('group message', messageData);
    }

    setNewMessage('');
  };

  const handleUserSelect = (user) => {
    setSelectedUser(user);
    setSelectedGroup(null);
    setTabValue(0);
    setMessages([]); // Clear messages when selecting a new user
  };

  const handleGroupSelect = (group) => {
    setSelectedGroup(group);
    setSelectedUser(null);
    setTabValue(1);
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
    if (newValue === 0) {
      setSelectedGroup(null);
    } else {
      setSelectedUser(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    navigate('/login');
  };

  // Toggle drawer on mobile
  const toggleDrawer = () => {
    setDrawerOpen(!drawerOpen);
  };

  // Determine if we're on mobile
  const isMobile = window.innerWidth < 768;

  // Get current group messages
  const currentGroupMessages = selectedGroup ? (groupMessages[selectedGroup.id] || []) : [];

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Drawer
        variant={isMobile ? 'temporary' : 'permanent'}
        open={isMobile ? drawerOpen : true}
        onClose={isMobile ? toggleDrawer : undefined}
        sx={{
          width: 240,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: 240,
            boxSizing: 'border-box',
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', padding: 1 }}>
          {isMobile && (
            <IconButton onClick={toggleDrawer}>
              <MenuIcon />
            </IconButton>
          )}
          <IconButton color="primary" onClick={handleLogout} title="Logout">
            <LogoutIcon />
          </IconButton>
        </Box>
        <Box sx={{ overflow: 'auto' }}>
          <Tabs value={tabValue} onChange={handleTabChange} centered sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tab icon={<PersonIcon />} label="Users" />
            <Tab icon={<GroupIcon />} label="Groups" />
          </Tabs>

          {tabValue === 0 ? (
            <List>
              {users.length > 0 ? (
                users.map((user) => (
                  <ListItemButton
                    key={user.id || user._id}
                    selected={selectedUser && (selectedUser.id === user.id || selectedUser._id === user._id)}
                    onClick={() => handleUserSelect(user)}
                  >
                    <ListItemIcon>
                      <Avatar>
                        {user.username ? user.username.charAt(0).toUpperCase() : 'U'}
                      </Avatar>
                    </ListItemIcon>
                    <ListItemText primary={user.username} />
                  </ListItemButton>
                ))
              ) : (
                <ListItem>
                  <ListItemText primary="No users available" />
                </ListItem>
              )}
            </List>
          ) : (
            <List>
              {groups.length > 0 ? (
                groups.map((group) => (
                  <ListItemButton
                    key={group.id}
                    selected={selectedGroup && selectedGroup.id === group.id}
                    onClick={() => handleGroupSelect(group)}
                  >
                    <ListItemIcon>
                      <Badge badgeContent={group.members?.length || 0} color="primary">
                        <GroupIcon />
                      </Badge>
                    </ListItemIcon>
                    <ListItemText 
                      primary={group.name} 
                      secondary={group.description || ''}
                    />
                  </ListItemButton>
                ))
              ) : (
                <ListItem>
                  <ListItemText primary="No groups available" />
                </ListItem>
              )}
            </List>
          )}
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          pt: 3, // Reduce padding top since AppBar is removed
          alignItems: 'center', // Center horizontally
        }}
      >
        <Paper
          elevation={3}
          sx={{
            width: '100%',
            maxWidth: '800px', // Set a maximum width
            flexGrow: 1,
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            mx: 'auto', // Center the paper component
          }}
        >
          {selectedUser ? (
            <>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Chatting with {selectedUser.username}
              </Typography>
              <Box
                sx={{
                  flexGrow: 1,
                  overflow: 'auto',
                  mb: 2,
                }}
              >
                <List>
                  {messages.length > 0 ? (
                    messages.map((message, index) => (
                      <ListItem
                        key={index}
                        sx={{
                          justifyContent: 'center',
                          '& .MuiPaper-root': {
                            maxWidth: '70%',
                            marginLeft: message.senderId === currentUser.id ? 'auto' : '0',
                            marginRight: message.senderId === currentUser.id ? '0' : 'auto',
                          }
                        }}
                      >
                        <Paper
                          sx={{
                            p: 2,
                            backgroundColor:
                              message.senderId === currentUser.id
                                ? 'primary.main'
                                : 'grey.300',
                            color:
                              message.senderId === currentUser.id
                                ? 'primary.contrastText'
                                : 'text.primary',
                          }}
                        >
                          <Typography variant="body1">{message.content}</Typography>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </Typography>
                        </Paper>
                      </ListItem>
                    ))
                  ) : (
                    <Box sx={{ textAlign: 'center', mt: 4 }}>
                      <Typography variant="body1" color="textSecondary">
                        No messages yet. Start the conversation!
                      </Typography>
                    </Box>
                  )}
                  <div ref={messagesEndRef} />
                </List>
              </Box>
            </>
          ) : selectedGroup ? (
            <>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {selectedGroup.name}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                {selectedGroup.description}
              </Typography>
              <Box
                sx={{
                  flexGrow: 1,
                  overflow: 'auto',
                  mb: 2,
                }}
              >
                <List>
                  {currentGroupMessages.length > 0 ? (
                    currentGroupMessages.map((message, index) => (
                      <ListItem
                        key={index}
                        sx={{
                          justifyContent: 'center',
                          '& .MuiPaper-root': {
                            maxWidth: '70%',
                            marginLeft: message.senderId === currentUser.id ? 'auto' : '0',
                            marginRight: message.senderId === currentUser.id ? '0' : 'auto',
                          }
                        }}
                      >
                        <Paper
                          sx={{
                            p: 2,
                            backgroundColor:
                              message.senderId === currentUser.id
                                ? 'primary.main'
                                : 'grey.300',
                            color:
                              message.senderId === currentUser.id
                                ? 'primary.contrastText'
                                : 'text.primary',
                          }}
                        >
                          {message.senderId !== currentUser.id && (
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                              {message.senderUsername}
                            </Typography>
                          )}
                          <Typography variant="body1">{message.content}</Typography>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </Typography>
                        </Paper>
                      </ListItem>
                    ))
                  ) : (
                    <Box sx={{ textAlign: 'center', mt: 4 }}>
                      <Typography variant="body1" color="textSecondary">
                        No messages yet. Start the conversation!
                      </Typography>
                    </Box>
                  )}
                  <div ref={messagesEndRef} />
                </List>
              </Box>
            </>
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Typography variant="h6" color="textSecondary">
                {tabValue === 0 ? 'Select a user to start chatting' : 'Select a group to start chatting'}
              </Typography>
            </Box>
          )}

          <Box
            component="form"
            onSubmit={handleSendMessage}
            sx={{
              display: 'flex',
              gap: 1,
            }}
          >
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              disabled={!(selectedUser || selectedGroup)}
            />
            <IconButton
              color="primary"
              type="submit"
              disabled={!(selectedUser || selectedGroup) || !newMessage.trim()}
            >
              <SendIcon />
            </IconButton>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
};

export default Chat; 