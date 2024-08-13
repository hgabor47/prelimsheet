@echo off
echo Commit if you are granted.
SET /P message=Please enter your commit message:
git add .
git commit -m "%message%"
git pull
git push 

echo Finished
