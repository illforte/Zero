const { createSimpleAuth } = require('./dist/lib/auth.js');
console.log(Object.keys(createSimpleAuth().api));
