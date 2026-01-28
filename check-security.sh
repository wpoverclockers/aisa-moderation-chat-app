#!/bin/bash

echo "🔒 Security Check Before Deployment"
echo "===================================="
echo ""

# Check 1: Verify .env is gitignored
echo "1. Checking if .env files are gitignored..."
if git check-ignore backend/.env 2>/dev/null; then
  echo "   ✅ backend/.env is gitignored"
else
  echo "   ❌ ERROR: backend/.env is NOT gitignored!"
  echo "   Add it to .gitignore before deploying!"
  exit 1
fi

# Check 2: Search for API tokens in code
echo ""
echo "2. Searching for API tokens in source code..."
TOKEN_COUNT=$(grep -r "hf_" . --exclude-dir=node_modules --exclude="*.md" --exclude="*.json" --exclude=".git*" --exclude="*.sh" 2>/dev/null | grep -v "HF_API_TOKEN" | grep -v "huggingface" | wc -l | tr -d ' ')

if [ "$TOKEN_COUNT" -eq 0 ]; then
  echo "   ✅ No API tokens found in source code"
else
  echo "   ⚠️  Found potential tokens. Review these files:"
  grep -r "hf_" . --exclude-dir=node_modules --exclude="*.md" --exclude="*.json" --exclude=".git*" --exclude="*.sh" 2>/dev/null | grep -v "HF_API_TOKEN" | grep -v "huggingface"
  exit 1
fi

# Check 3: Verify .env is not in git status
echo ""
echo "3. Checking git status for .env files..."
if git status --porcelain | grep -E "\.env$"; then
  echo "   ❌ ERROR: .env files are staged or modified!"
  echo "   Unstage them: git reset HEAD backend/.env"
  exit 1
else
  echo "   ✅ No .env files in git status"
fi

# Check 4: Verify .gitignore includes .env
echo ""
echo "4. Verifying .gitignore configuration..."
if grep -q "\.env" .gitignore 2>/dev/null; then
  echo "   ✅ .env is in .gitignore"
else
  echo "   ⚠️  Warning: .env might not be in .gitignore"
fi

echo ""
echo "✅ Security check passed! Safe to deploy."
echo ""
echo "Next steps:"
echo "1. git add ."
echo "2. git commit -m 'Deploy: Chat moderation app'"
echo "3. git push origin main"
echo "4. Deploy to Railway (backend) and Vercel (frontend)"
