#!/bin/bash
# ===========================================
# FitTracker - 推送代码到 GitHub 并触发 APK 构建
# ===========================================
#
# 使用方法：
# 1. 打开你的本地终端 (CMD / PowerShell / Git Bash)
# 2. 进入项目目录：
#    cd C:\Users\23625\WorkBuddy\2026-06-24-15-01-21\fitness-app
# 3. 运行此脚本：
#    bash push-to-github.sh
#
# 如果没有 Git Bash，也可以手动执行脚本中的命令
#

echo "=== FitTracker GitHub 推送脚本 ==="
echo ""

# 确认当前分支是 main
CURRENT_BRANCH=$(git branch --show-current)
echo "当前分支: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "切换分支到 main..."
    git branch -M main
fi

# 确认 remote 已设置
REMOTE=$(git remote get-url origin 2>/dev/null)
if [ -z "$REMOTE" ]; then
    echo "添加 remote origin..."
    git remote add origin https://github.com/lala233456/fittracker.git
else
    echo "Remote origin: $REMOTE"
fi

# 推送代码
echo ""
echo "推送代码到 GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 推送成功！"
    echo ""
    echo "GitHub Actions 将自动开始构建 APK"
    echo "查看构建进度："
    echo "  https://github.com/lala233456/fittracker/actions"
    echo ""
    echo "构建完成后（约5-10分钟），APK 可以从："
    echo "  https://github.com/lala233456/fittracker/releases"
    echo "下载安装到 Android 手机"
else
    echo ""
    echo "❌ 推送失败，请检查："
    echo "  1. GitHub 账号认证是否正确"
    echo "  2. 网络是否可以访问 github.com"
    echo "  3. 仓库 https://github.com/lala233456/fittracker 是否存在"
    echo ""
    echo "如果需要认证，可能需要："
    echo "  git config --global credential.helper store"
    echo "  然后再次 push（会提示输入 GitHub 用户名和密码/token）"
fi
