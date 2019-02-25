const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const types = require('@babel/types');
const fs = require('fs');
const path = require('path');
const file = fs.readFileSync(path.resolve(__dirname, './component-tokens.js'), 'utf-8');
let ast = parser.parse(file, {
  sourceType: 'module',
});

let cache = {};


function buildPropertyMap (key, value) {
  if (cache[key]) {
    cache[key] = cache[key].add(value);
  } else {
    cache[key] = new Set([value]);
  }
};

function resolveToken (value) {
  return Object.keys(cache).find((key) => (cache[key].has(value)));
};

function convertToArray (cache) {
  return Object.keys(cache).reduce((acc, curr) => {
    acc[curr] = Array.from(cache[curr]);
    return acc;
  }, {});
};

function getLiteralIdentifier (path, context) {
  let parent = path.get('parent');
  if (parent.parentPath.parentKey === 'init') {
    let key = parent.parentPath.container.id.name;
    buildPropertyMap(path.node.value, key);
  }
}

traverse(ast, {
  Identifier: function (path) {
    let parent = path.get('parent');
    if (parent.parentPath.parentKey === 'init') {
      let token = resolveToken(path.node.name);
      buildPropertyMap(token, parent.parentPath.container.id.name);
    }
  },
  StringLiteral: getLiteralIdentifier,
  NumericLiteral: getLiteralIdentifier,
  VariableDeclarator: function (path) {
    let id = path.get('id');
    let init = path.get('init');
  },
  MemberExpression: function (path) {
    let object = path.get('object').node.name;
    let property = path.get('property')
    let binding = `${object}.${property.node.name}`;
    let assignee = path.parentPath.node.id.name;
    buildPropertyMap(`${object}.${property}`, assignee);
  },
});

fs.writeFileSync(path.resolve(__dirname, './data.json'), JSON.stringify(convertToArray(cache), null, 1));
