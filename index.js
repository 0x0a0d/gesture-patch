#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

function findProjectRootPath(cwd) {
  try {
    const json = require(path.join(cwd, 'package.json'))
    if (json.dependencies['react-native-gesture-handler'] != null) {
      return cwd
    }
  } catch (e) {}
  if (cwd === '/') throw new Error('Could not detect root project path. Maybe you forgot to install? "yarn add react-native-gesture-handler"')
  return findProjectRootPath(path.resolve(cwd, '../'))
}

function injectIndexJs(projPath) {
  const indexPath = path.join(projPath, 'index.js')
  if (!fs.existsSync(indexPath)) {
    throw new Error(`index.js not found in '${projPath}'`)
  }
  console.log(`Found index.js at '${indexPath}'`)
  try {
    const content = fs.readFileSync(indexPath, { encoding: 'utf8' })
    if (!/^\s*import\s+(['"])react-native-gesture-handler\1\s*;?/.test(content)) {
      const re = /^\s*import\s+(['"])(?:(?!\1).)+\1\s*;?\s*$/m
      const m = re.exec(content)
      if (m == null) {
        console.log('Injecting content...')
        const nContent = [
          '// auto import react-native-gesture-handler',
          `import "react-native-gesture-handler"`,
          content
        ].join('\n')
        fs.writeFileSync(indexPath, nContent)
        console.log('Done')
      } else {
        console.log('Patched! Ignore')
      }
    }
  } catch (e) {
    throw new Error(`inject index.js failed: ${e.message}`)
  }
}
function packageIndexOf(inContent, packageName) {
  if (!/^[a-z]+(\.\s*[a-zA-Z0-9]+)*$/.test(packageName)) {
    throw new Error(`Invalid package name: '${packageName}'`)
  }
  const re = new RegExp(`^\\s*import\\s+${packageName.split(/\.\s*/).join('\\.\\s*')}\\s*;`, 'm')
  const m = re.exec(inContent)
  if (m != null) {
    return m.index
  } else {
    return -1
  }
}

function injectMainActivityJava(projPath) {
  const javaPath = (mainJava => {
    for (const javaClass of fs.readdirSync(mainJava)) {
      const checkPath = path.join(mainJava, javaClass, 'MainActivity.java')
      if (fs.existsSync(checkPath)) return checkPath
    }
  })(path.resolve(projPath, 'android/app/src/main/java/com/'))
  if (javaPath == null) {
    throw new Error('Could not detect MainActivity.java. Please follow instruction here: https://docs.swmansion.com/react-native-gesture-handler/docs/#android')
  }
  console.log(`Found MainActivity.java at '${javaPath}'`)
  try {
    const content = fs.readFileSync(javaPath, { encoding: 'utf8' })
    let nContent = content
    if (packageIndexOf(content, 'com.swmansion.gesturehandler.react.RNGestureHandlerEnabledRootView') === -1) {
      const reactIndex = packageIndexOf(content, 'com.facebook.react.ReactActivity')
      if (reactIndex === -1) {
        throw new Error('Could not detect com.facebook.react.ReactActivity')
      }
      const packages = [
        'com.swmansion.gesturehandler.react.RNGestureHandlerEnabledRootView'
      ]
      for (const p of [
        'com.facebook.react.ReactRootView',
        'com.facebook.react.ReactActivityDelegate',
      ]) {
        if (packageIndexOf(content, p) === -1) {
          packages.unshift(p)
        }
      }
      console.log('Going to add packages: \n', packages.join('\n'))

      nContent = [
        content.substr(0, reactIndex),
        ...packages.map(p => `import ${p};`),
        content.substr(reactIndex)
      ].join('\n')
    }
    if (!/\s+ReactActivityDelegate\s+createReactActivityDelegate/.test(nContent)) {
      const re = new RegExp('class MainActivity extends ReactActivity \\{'.split(/\s+/).join('\\s+') + '\\s*\n')
      const m = re.exec(nContent)
      if (m == null) {
        throw new Error('Inject class MainActivity failed')
      }
      console.log('createRootView override')
      const lastIndex = m.index + m[0].length
      nContent = [
        nContent.substr(0, lastIndex),
        `  // Auto import gesture
  @Override
  protected ReactActivityDelegate createReactActivityDelegate() {
    return new ReactActivityDelegate(this, getMainComponentName()) {
      @Override
      protected ReactRootView createRootView() {
       return new RNGestureHandlerEnabledRootView(MainActivity.this);
      }
    };
  }
`,
        nContent.substr(lastIndex)
      ].join('\n')
    }
    if (nContent !== content) {
      console.log('Write changes')
      fs.writeFileSync(javaPath, nContent)
    }
    console.log('Done')
  } catch (e) {
    throw new Error(`inject MainActivity.java failed: ${e.message}`)
  }
}
const projPath = findProjectRootPath(process.cwd())
injectIndexJs(projPath)
injectMainActivityJava(projPath)
