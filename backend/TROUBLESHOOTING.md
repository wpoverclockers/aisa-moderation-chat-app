# Troubleshooting Guide

## Server Won't Start

### 1. Check Dependencies
Make sure all dependencies are installed:
```bash
cd backend
npm install
```

### 2. Check Environment Variables
Make sure your `.env` file exists and has the correct values:
```bash
# Check if .env exists
ls -la backend/.env

# Verify HF_API_URL is set (should be: duchaba/Friendly_Text_Moderation)
cat backend/.env | grep HF_API_URL
```

### 3. Check for Port Conflicts
Make sure port 3001 is not already in use:
```bash
lsof -i :3001
# If something is using it, either stop that process or change PORT in .env
```

### 4. Check Node.js Version
Make sure you're using Node.js 18 or higher:
```bash
node --version
# Should be v18.x.x or higher
```

### 5. Run with Verbose Output
Try running the server directly to see error messages:
```bash
cd backend
node src/server.js
```

### 6. Common Errors

**Error: Cannot find module '@gradio/client'**
- Solution: Run `npm install` in the backend directory

**Error: MODERATION_THRESHOLD out of range**
- The safer parameter must be between 0.005 and 0.1
- The code automatically maps MODERATION_THRESHOLD (0.0-1.0) to this range
- If you see this error, check the moderationService.js file

**Error: EADDRINUSE (port already in use)**
- Solution: Change PORT in .env or stop the process using port 3001

## API Issues

### Safer Value Error
If you see "Value X is greater than maximum value 0.1":
- The code now automatically maps MODERATION_THRESHOLD to the correct range
- Make sure you're using the latest version of moderationService.js

### Connection Errors
If the Gradio client can't connect:
- Check your internet connection
- Verify the Space is running: https://huggingface.co/spaces/duchaba/Friendly_Text_Moderation
- The Space might be loading - wait a minute and try again
