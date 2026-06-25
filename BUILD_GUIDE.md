# FitTracker APK 构建指南

## 项目结构
```
fitness-app/
├── www/                    ← Web应用文件（HTML/CSS/JS）
├── android/                ← Capacitor生成的Android原生项目
├── capacitor.config.json   ← Capacitor配置
├── package.json            ← npm依赖
└── icon-512.png            ← Play Store图标
```

## 打包 APK 步骤

### 方案一：用 Android Studio（推荐）

1. **安装 Android Studio**
   - 下载：https://developer.android.com/studio
   - 安装时勾选 Android SDK、Android SDK Command-line Tools

2. **打开项目**
   ```
   Android Studio → Open → 选择 fitness-app/android 目录
   ```

3. **构建 APK**
   - 菜单：Build → Build Bundle(s) / APK(s) → Build APK(s)
   - 生成的 APK 在：`android/app/build/outputs/apk/debug/app-debug.apk`

4. **构建 Release APK（正式版）**
   - 菜单：Build → Generate Signed Bundle / APK
   - 需要创建签名密钥（keystore）
   - 选择 release 模式构建

### 方案二：命令行构建（需要 JDK + Android SDK）

1. **环境要求**
   - JDK 17+
   - Android SDK（compileSdk 35）
   - Gradle 8.x

2. **构建 debug APK**
   ```bash
   cd android
   ./gradlew assembleDebug
   # APK 在 app/build/outputs/apk/debug/app-debug.apk
   ```

3. **构建 release APK**
   ```bash
   ./gradlew assembleRelease
   # 需要先在 app/build.gradle 配置 signingConfigs
   ```

### 方案三：云端构建（不需要本地环境）

1. **GitHub Actions**
   - 把项目推到 GitHub
   - 配置 CI 自动构建 APK

2. **Appetize.io**
   - 在线模拟器测试，不需要本地Android环境

## 更新 Web 代码后重新打包

```bash
# 1. 更新 www 目录中的文件
# 2. 同步到 Android 项目
npx cap sync android
# 3. 在 Android Studio 重新 Build
```

## 安装到手机

```bash
# 方法一：USB连接手机
adb install app-debug.apk

# 方法二：直接传输
# 把 APK 文件通过微信/QQ发送到手机，点击安装
```

## 注意事项
- 首次构建需要下载 Gradle 和 Android SDK 依赖，可能需要几分钟
- debug APK 可以直接安装使用
- release APK 需要签名才能安装
- 所有数据存储在 WebView 的 IndexedDB 中，与浏览器版数据独立
