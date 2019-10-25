/* eslint-disable no-loop-func,no-unused-vars */
const wildcard = require('wildcard-utils').Wildcard;

/**
 * Extended DeepCopy Function Including Filters 
 * `Simplest Use Example : deepCopyPro(source)`
 * @param {Dict} source Required Source object to apply nested copy
 * @param {Dict} kwargs Optional Dictionary, containing arguments described below - `Èx  deepCopyPro(source,{omitKeys : ['*.key2'], replaceValues :{'*.key2' : 'value2'}, omitValues : [null], renameKeys : {'*.key3' : key3_1}}`
 * @param {Array} selectKeys Array of Selected Keys - Supports WildCards - `Ex: deepCopyPro(source,{selectKeys : ['key1','*.key2','key3.*.key3_1']}`
 * @param {Array} selectValues Array of Selected Values - `Ex: deepCopyPro(source,{selectValues : ['$deleted','',null]}`
 * @param {Array} omitKeys Array of Omited Keys - Supports WildCards - `Ex: deepCopyPro(source,{omitKeys : ['key1','*.key2','key3.*.key3_1']}`
 * @param {Array} omitValues Array of Omited Values - `Ex: deepCopyPro(source,{omitValues : [null, '$deleted', undefined]}`
 * @param {Dict} renameKeys Dictionary of {find:rename} - Supports WildCards - `Ex: deepCopyPro(source,{renameKeys : {findKey1 : 'renameKey1', 'findKey2.*.findKey2_1' : 'renameKey2'}}`
 * @param {Dict} replaceValues Dictionary of {find:replace} - Supports WildCards - `Ex: deepCopyPro(source,{replaceValues : {findKey1 : 'replaceVal1', '*.findKey2' : 'replaceVal2'}}`
 * @param {Dict} internals Used to pass input and control arguments itself recursively. Do not assign any values. Function works properly if somehow assigned erroneously.
 */
function deepCopyPro(source, kwargs = {}, internals = {}){
    let found = false
    let {path,foundBefore,level,isEmptyCache,byPassLevelZeroInits} = internals
    const {selectKeys, omitKeys, replaceValues, renameKeys, omitValues, selectValues} = kwargs
    
    let target = Array.isArray(source) ? [] : {};
    let t,f,fullPath,renameValue,replaceValue
    
    if (!byPassLevelZeroInits ){
      path = ''
      level = 0
      foundBefore = false
      isEmptyCache = {}
      isEmptyCache.pickList = isEmpty(selectKeys)
      isEmptyCache.omitList = isEmpty(omitKeys)
      isEmptyCache.replaceList = isEmpty(replaceValues)
      isEmptyCache.renameList = isEmpty(renameKeys)
      isEmptyCache.omitValue = isEmpty(omitValues)
      isEmptyCache.pickValue = isEmpty(selectValues)
    }
  
    for (let i in source){
      found = false
      if (level === 0){
          fullPath = i.toString()}
      else{
          fullPath = path + '.' + i.toString()}
      
      const o1 = isEmptyCache.omitList || isArray(source) || !findMatchInList(fullPath, omitKeys)
      const o2 = isEmptyCache.omitValue || !findMatchInList(source[i], omitValues, null, false)
      if (o1 && o2)
      {
        if (isEmptyCache.replaceList || isArray(source) || !findMatchInList(fullPath, replaceValues,r=>replaceValue=r)){
            // if sub object is an object
            const pickListFound = !isEmptyCache.pickList && findMatchInList(fullPath, selectKeys)
            const pickValueFound = !isEmptyCache.pickValue && findMatchInList(source[i], selectValues, null, false)
            if (pickListFound || pickValueFound){
                found = true
                if (isObject(getValue(source,i))){
                    isEmptyCache.pickList = true
                    let kw = kwargs.selectKeys
                    kwargs.selectKeys = []
                    const ret = deepCopyPro(getValue(source,i), kwargs, {path:fullPath, foundBefore:true, level:level + 1,isEmptyCache:isEmptyCache,byPassLevelZeroInits:true})
                    t = ret.target
                    f = ret.found
                    isEmptyCache.pickList = false
                    kwargs.selectKeys = kw
                    if (!isEmptyCache.renameList && findMatchInList(fullPath, renameKeys, r=>renameValue=r)){
                        setValue(target,renameValue,t)
                    }
                    else{
                        setValue(target,i,t)
                    }
                }
                else{
                    if (!isEmptyCache.renameList && findMatchInList(fullPath, renameKeys, r=>renameValue=r)){
                        setValue(target,renameValue,getValue(source,i))
                    }
                    else{
                        setValue(target,i,getValue(source,i))
                    }
                }
            }
            else{//pick list empty or match could not be found in this level
                if (isObject(getValue(source,i))){
                    const ret = deepCopyPro(getValue(source,i), kwargs, {path:fullPath, foundBefore:foundBefore, level:level + 1,isEmptyCache:isEmptyCache,byPassLevelZeroInits:true})
                    t = ret.target
                    f = ret.found
                    if (!isEmptyCache.renameList && findMatchInList(fullPath, renameKeys, r=>renameValue=r)){
                        if (!f &&! foundBefore && (!isEmptyCache.pickList || !isEmptyCache.pickValue)){
                            delValue(target,renameValue)
                        }
                        else{
                          setValue(target,renameValue,t)
                        }
                    }
                    else{
                        if (!f && !foundBefore && (!isEmptyCache.pickList || !isEmptyCache.pickValue)){
                            delValue(target,i)
                        }
                        else{
                          setValue(target,i,t)
                        }
                    }
                    found = found || f
                }
                // if anything else
                else if ((isEmptyCache.pickList || pickListFound) && (isEmptyCache.pickValue || pickValueFound)){
                    if (!isEmptyCache.renameList && findMatchInList(fullPath, renameKeys, r=>renameValue=r)){
                        setValue(target,renameValue,getValue(source,i))
                    }
                    else{
                        setValue(target,i,getValue(source,i))
                    }
                }
            }
        }          
        else{ //target[i] = replaceList[i]
            if (!isEmptyCache.renameList && findMatchInList(fullPath, renameKeys, r=>renameValue=r)){
                setValue(target,renameValue,replaceValue)
              }
            else{
                setValue(target,i,replaceValue)
              }
        }
      }
    }
    
  
    if (level === 0){
        return target
    }
    else{
        return {target,found}
    }
  }

function isEmpty (obj){
  if (obj === null || obj === undefined) {
    return true
  }
  else if (typeof obj !== 'object'){
    if (typeof obj === 'string' && obj === ''){
      return true
    }
    else {
      return false
    }
  }
  else if (Array.isArray(obj)){
    return obj.length === 0
  }
  else {
    return Object.keys(obj).length === 0    
  }
  
}

function isObject(obj){
  return (isDict(obj) || isArray(obj)) 
}

function isDict(v) {
  return !!v && typeof v==='object' && v!==null && !(v instanceof Array) && !(v instanceof Date) 
}

function isArray(obj){
 return Array.isArray(obj)
}

function getValue(obj,key){
  return obj[key]
}

function setValue(obj,key,value){
if (Array.isArray(obj)){
    obj.push(value)
    return obj
}
else{
    obj[key] = value
    return obj
}
}

function delValue(obj,key){
if (isArray(obj)){
  obj.pop()
}
else {
  delete obj[key]  
}
}

function wildCardEscape(str) {
  return str.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
}

function findMatchInList(testString, lst, callBack, useWildCard=true){
  // determine list type
  let matchList
  if (Array.isArray(lst)){//if Array
    matchList = lst
  }
  else if (typeof lst === 'object'){//if dictionary
    matchList = Object.keys(lst)
  }
  else if (typeof lst === 'string'){// if string
    matchList = lst.split(',')
  }
  else return null
  
  //iterate through elements
  for (let i=0; i < matchList.length ; i++){
    const matchPattern = matchList[i]
    const wildCardEscaped = useWildCard && wildCardEscape(matchPattern.toString())
    const match = useWildCard ? new wildcard().case(false).pattern(wildCardEscaped).match(testString.toString())
    : matchPattern === testString
    if (match){
      
      // if found call callBack function then return true
      //If dictionary
      if (callBack &&! Array.isArray(lst)){
          const key = matchList[i]
          callBack(lst[key])
      }
      // If Array
      if (callBack && Array.isArray(lst)){
        callBack(lst[i])
      }

      return true
    }
  }
  //not found return false
  return false
}


module.exports = deepCopyPro;