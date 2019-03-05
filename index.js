#!/usr/bin/env node
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const types = require('@babel/types');
const fs = require('fs');
const path = require('path');

class PropertyMap {
  constructor () {
    this.propertyMap = {};
  }
  build (key, value) {
    if (this.propertyMap[key]) {
      this.propertyMap[key] = this.propertyMap[key].add(value);
    } else {
      this.propertyMap[key] = new Set([value]);
    }
  }
  resolveProperty (value) {
    return Object.keys(this.propertyMap).find((key) => (this.propertyMap[key].has(value)));
  }
  getExportableMap () {
    return Object.keys(this.propertyMap).reduce((acc, curr) => {
      acc[curr] = Array.from(this.propertyMap[curr]);
      return acc;
    }, {});
  }
}

let propertyMap = new PropertyMap();

visitorFactory = (name) => {
  let visitors = {};

  function getLiteralIdentifier (path) {
    let parent = path.get('parent');
    if (parent.parentPath.parentKey === 'init') {
      let key = parent.parentPath.container.id.name;
      propertyMap.build(path.node.value, `${name}_${key}`);
    }
  }

  function resolveCallExpressionArgument (argument) {
      switch (argument.type) {
        case 'MemberExpression': {
          return `${resolveCallExpressionArgument(argument.object)}.${resolveCallExpressionArgument(argument.property)}`;
        }
        case 'Identifier': {
          return argument.name;
        }
        case 'StringLiteral': {
          return argument.value;
        }
        case 'NumericLiteral': {
          return argument.value;
        }
        default: {
          return '';
        }
      }
  }

  visitors.Identifier = function (path) {
    let parent = path.get('parent');
    if (parent.parentPath.parentKey === 'init') {
      const token = propertyMap.resolveProperty(`${name}_${path.node.name}`);
      propertyMap.build(token, `${name}_${parent.parentPath.container.id.name}`);
    }
  };
  visitors.CallExpression = function (path) {
    if (types.isVariableDeclarator(path.parentPath.node)) {

      if (arguments) {
        const functionName = path.get('callee').node.name;
        const arguments = path.node.arguments.map(resolveCallExpressionArgument);
        propertyMap.build(`${functionName}(${arguments.join(', ')})`, `${name}_${path.parentPath.node.id.name}`);
      } else {
        propertyMap.build(`${functionName}()`, `${name}_${path.parentPath.node.id.name}`);
      }
    }
  },
  visitors.StringLiteral = getLiteralIdentifier;
  visitors.NumericLiteral = getLiteralIdentifier;
  visitors.MemberExpression = function (path) {
    const object = path.get('object').node.name;
    const property = path.get('property').node.name;
    // if (types.isCallExpression(path.parentPath.node)) return;
    if (types.isVariableDeclarator(path.parentPath.node)) {
      const assignee = path.parentPath.node.id.name;
      propertyMap.build(`${object}.${property}`, `${name}_${assignee}`);
    }
  };

  return visitors;
};

async function componentAudit (component) {
  try {
    const componentPath = path.resolve(process.cwd(), `./packages/core/${component}`);
    const componentTokensPath = path.resolve(componentPath, './src/component-tokens.js');
    if (!fs.existsSync(componentPath)) {
      console.error(`WARNING: ${componentPath} is invalid, moving on`);
      return;
    }
    if (!fs.existsSync(componentTokensPath)) {
      console.error(`WARNING ${componentTokensPath} is invalid, moving on`);
      return;
    }
    const componentName = await require(path.resolve(componentPath, './package.json')).name;
    const file = fs.readFileSync(componentTokensPath, 'utf-8');
    let ast = parser.parse(file, {
      sourceType: 'module',
    })
    traverse(ast, visitorFactory(componentName));
  } catch (e) {
    console.trace(e);
  }
}

function getPackageList (references) {
  const packages = new Set();
  references.forEach((r) => {
    packages.add(r.package);
  });
  return Array.from(packages);
}

function tokensArrayToObject (referencesArray, value) {
  const token = referencesArray.reduce((acc, curr) => {
    const [ package, concern, component, appearance, styleprop, state, mode ] = curr.replace('__', '_').split('_');
    acc.references.push({
      package,
      concern,
      component,
      appearance,
      styleprop,
      state,
      mode,
      name: curr,
    });
    return acc;
  }, {
   value,
   references: [],
   length: referencesArray.length,
  });

  return {
    ...token,
    packages: getPackageList(token.references),
  }
}

function formatData (map) {
  return Object.keys(map).reduce((acc, curr) => {

    const formattedValues = tokensArrayToObject(map[curr], curr);

    if (curr.includes('colors.') || curr.includes('gridSize')) {
      acc.tokenizedValues.push(formattedValues);
    } else {
      acc.rawValues.push(formattedValues);
    }
    return acc;
  },{
    tokenizedValues: [],
    rawValues: [],
  })
}

async function run () {
  const componentList = [
    'button',
    'checkbox',
    'radio',
    'inline-edit',
    'inline-message',
    'section-message',
    'flag',
    'select',
    'banner',
    'badge',
    'lozenge',
    'css-reset'
  ];
  await Promise.all(componentList.map(componentAudit));
  const exportableMap = formatData(propertyMap.getExportableMap());

  fs.writeFileSync(path.resolve(__dirname, './data.json'), JSON.stringify(exportableMap, null, 1));
}

run();
