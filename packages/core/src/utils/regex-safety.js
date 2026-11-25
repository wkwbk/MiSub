function readRepeatingQuantifierEnd(pattern, startIndex) {
  const ch = pattern[startIndex];
  if (ch === '+' || ch === '*') {
    return pattern[startIndex + 1] === '?' ? startIndex + 2 : startIndex + 1;
  }
  if (ch === '{') {
    const match = pattern.slice(startIndex).match(/^\{(\d+)(?:,(\d*))?\}\??/);
    if (!match) return -1;
    const min = Number(match[1]);
    const maxRaw = match[2];
    const isMultiRepeat = maxRaw === undefined ? min > 1 : maxRaw === '' || Number(maxRaw) > 1;
    if (isMultiRepeat) {
      return startIndex + match[0].length;
    }
  }
  return -1;
}

/**
 * 校验用户输入的正则表达式是否存在嵌套量词（ReDoS 风险）及语法错误
 * @param {string} pattern
 * @param {number} [maxLength=256]
 * @returns {boolean}
 */
export function isSafeUserRegexPattern(pattern, maxLength = 256) {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > maxLength) {
    return false;
  }

  const groupStack = [];
  let inCharClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (inCharClass) {
      if (ch === ']') {
        inCharClass = false;
      }
      continue;
    }
    if (ch === '[') {
      inCharClass = true;
      continue;
    }
    if (ch === '(') {
      if (groupStack.length >= 16) {
        return false;
      }
      groupStack.push({ hasInnerQuantifier: false, hasAlternation: false });
      continue;
    }
    if (ch === '|') {
      if (groupStack.length > 0) {
        groupStack[groupStack.length - 1].hasAlternation = true;
      }
      continue;
    }
    if (ch === ')') {
      if (groupStack.length === 0) {
        return false;
      }
      const closed = groupStack.pop();
      if (!closed) {
        return false;
      }
      const quantifierEnd = readRepeatingQuantifierEnd(pattern, i + 1);
      if (quantifierEnd !== -1) {
        if (closed.hasInnerQuantifier || closed.hasAlternation) {
          return false;
        }
        if (groupStack.length > 0) {
          groupStack[groupStack.length - 1].hasInnerQuantifier = true;
        }
        i = quantifierEnd - 1;
      } else if (closed.hasInnerQuantifier && groupStack.length > 0) {
        groupStack[groupStack.length - 1].hasInnerQuantifier = true;
      }
      continue;
    }
    if (ch === '+' || ch === '*' || ch === '{') {
      const quantifierEnd = readRepeatingQuantifierEnd(pattern, i);
      if (quantifierEnd !== -1) {
        if (groupStack.length > 0) {
          groupStack[groupStack.length - 1].hasInnerQuantifier = true;
        }
        i = quantifierEnd - 1;
      }
    }
  }

  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}
