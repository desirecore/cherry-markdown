/**
 * Copyright (C) 2021 Tencent.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import ParagraphBase from '@/core/ParagraphBase';
import { compileRegExp } from '@/utils/regexp';
import { isValidScheme } from '@/utils/sanitize';
import UrlCache from '@/UrlCache';
/**
 * 脚注和引用语法
 * 示例：
 *    这里需要一个脚注[^脚注别名1]，另外这里也需要一个脚注[^another]。
 *    [^脚注别名1]: 无论脚注内容写在哪里，脚注的内容总会显示在页面最底部
 *    以两次回车结束
 *
 *    [^another]: 另外，脚注里也可以使用一些简单的markdown语法
 *    >比如 !!#ff0000 这里!!有一段**引用**
 */
export default class CommentReference extends ParagraphBase {
  static HOOK_NAME = 'commentReference';

  constructor({ externals, config }) {
    super();
    this.commentCache = {};
  }

  $cleanCache() {
    this.commentCache = {};
  }

  /**
   * 去除包裹 url 的尖括号
   * @param {string} wrappedUrl
   */
  unwrapUrl(wrappedUrl) {
    const url = wrappedUrl.trim();
    // 原始的尖括号
    if (url.startsWith('<') && url.endsWith('>')) {
      return url.slice(1, -1);
    }
    // 被转义保护的尖括号
    if (url.startsWith('&#60;') && url.endsWith('&#62;')) {
      return url.slice(5, -5);
    }
    return url;
  }

  pushCommentReferenceCache(key, cache) {
    const [url, ...args] = cache.split(/[ ]+/g);
    const unwrappedUrl = this.unwrapUrl(url);
    this.commentCache[`${key}`.toLowerCase()] = { url: unwrappedUrl, args };
  }

  getCommentReferenceCache(key, isImage) {
    /** @type {{url: string, args: string[]} | undefined} */
    const reference = this.commentCache[`${key}`.toLowerCase()];
    if (!reference) {
      return null;
    }
    // The definition is shared by links and images.  Validate it only once we
    // know the consumer: `data:` must never become a clickable link, while a
    // FileReader-generated raster image remains a supported image source.
    const originalUrl = this.$engine?.$deCacheBigData?.(reference.url) ?? reference.url;
    if (!isValidScheme(originalUrl) && !(isImage && this.isSafeDataImage(originalUrl))) {
      return null;
    }
    return [UrlCache.set(reference.url), ...reference.args].join(' ');
  }

  isSafeDataImage(url) {
    return /^data:image\/(?:apng|gif|jpe?g|png|webp);base64,[a-z0-9+/=\s]*$/i.test(url);
  }

  isImageReference(source, offset) {
    if (source[offset - 1] !== '!') {
      return false;
    }
    let backslashCount = 0;
    for (let index = offset - 2; source[index] === '\\'; index -= 1) {
      backslashCount += 1;
    }
    return backslashCount % 2 === 0;
  }

  getBracketPairs(str) {
    const pairs = new Map();
    const stack = [];
    for (let index = 0; index < str.length; index += 1) {
      if (str[index] === '\\') {
        index += 1;
      } else if (str[index] === '\n') {
        stack.length = 0;
      } else if (str[index] === '[') {
        stack.push(index);
      } else if (str[index] === ']' && stack.length > 0) {
        pairs.set(stack.pop(), index);
      }
    }
    return pairs;
  }

  isInlineLinkDestination(str, labelEnd) {
    let destinationStart = labelEnd + 1;
    while (str[destinationStart] === ' ' || str[destinationStart] === '\t') {
      destinationStart += 1;
    }
    // Keep this grammar in lockstep with Link.RULE: empty destinations and
    // destinations containing unquoted whitespace are not consumed by Link,
    // so they must remain eligible for the existing shortcut-reference path.
    return /^\(((?:[^\s()]*\([^\s()]*\)[^\s()]*)+|[^\s)]+)(?:[ \t]((?:".*?")|(?:'.*?')))?\)/.test(
      str.slice(destinationStart),
    );
  }

  hasCommentReference(key) {
    return Object.prototype.hasOwnProperty.call(this.commentCache, `${key}`.toLowerCase());
  }

  findNestedLinkStart(str, start, end, pairs) {
    for (let index = start + 1; index < end; index += 1) {
      const labelEnd = pairs.get(index);
      if (typeof labelEnd === 'undefined' || labelEnd >= end) {
        continue;
      }
      const isImage = this.isImageReference(str, index);
      if (isImage && str[labelEnd + 1] !== '[') {
        continue;
      }
      if (this.isInlineLinkDestination(str, labelEnd)) {
        return { index, isImageReference: isImage };
      }
      if (str[labelEnd + 1] === '[') {
        const referenceEnd = pairs.get(labelEnd + 1);
        if (typeof referenceEnd !== 'undefined' && referenceEnd < end) {
          const label = str.slice(index + 1, labelEnd);
          const key = str.slice(labelEnd + 2, referenceEnd) || label;
          if (this.hasCommentReference(key)) {
            return { index, isImageReference: isImage };
          }
        }
      }
    }
    return -1;
  }

  replaceReferences(str) {
    const pairs = this.getBracketPairs(str);
    const frames = [{ end: str.length, index: 0, output: '', cache: null, referenceEnd: -1 }];

    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (frame.index >= frame.end) {
        frames.pop();
        if (frames.length === 0) {
          return frame.output;
        }
        const parent = frames[frames.length - 1];
        parent.output += `[${frame.output}](${frame.cache})`;
        parent.index = frame.referenceEnd + 1;
        continue;
      }

      if (str[frame.index] !== '[') {
        frame.output += str[frame.index];
        frame.index += 1;
        continue;
      }

      const textEnd = pairs.get(frame.index);
      if (typeof textEnd === 'undefined' || textEnd >= frame.end) {
        frame.output += str[frame.index];
        frame.index += 1;
        continue;
      }

      const label = str.slice(frame.index + 1, textEnd);
      let key = label;
      let referenceEnd = textEnd;
      const nextChar = str[textEnd + 1];
      if (this.isInlineLinkDestination(str, textEnd)) {
        frame.output += str.slice(frame.index, textEnd + 1);
        frame.index = textEnd + 1;
        continue;
      }
      if (nextChar === '[') {
        const candidateEnd = pairs.get(textEnd + 1);
        // [text][key](url) is the existing prefix-plus-inline-link form,
        // not a reference expression.
        if (typeof candidateEnd === 'undefined' || this.isInlineLinkDestination(str, candidateEnd)) {
          frame.output += str.slice(frame.index, textEnd + 1);
          frame.index = textEnd + 1;
          continue;
        }
        key = str.slice(textEnd + 2, candidateEnd) || label;
        referenceEnd = candidateEnd;
      }

      const nestedLinkStart = this.findNestedLinkStart(str, frame.index, textEnd, pairs);
      if (nestedLinkStart !== -1) {
        const cache = this.getCommentReferenceCache(key, this.isImageReference(str, frame.index));
        if (nestedLinkStart.isImageReference && cache) {
          frames.push({
            end: textEnd,
            index: frame.index + 1,
            output: '',
            cache,
            referenceEnd,
          });
          continue;
        }
        frame.output += str.slice(frame.index, nestedLinkStart.index);
        frame.index = nestedLinkStart.index;
        continue;
      }

      const cache = this.getCommentReferenceCache(key, this.isImageReference(str, frame.index));
      if (cache) {
        frame.output += `${str.slice(frame.index, textEnd + 1)}(${cache})`;
        frame.index = referenceEnd + 1;
        continue;
      }

      frame.output += str.slice(frame.index, referenceEnd + 1);
      frame.index = referenceEnd + 1;
    }
    return str;
  }

  /**
   *
   * @param {string} str
   * @returns
   */
  beforeMakeHtml(str) {
    let $str = str;
    if (this.test($str)) {
      $str = $str.replace(this.RULE.reg, (match, leading, key, content) => {
        this.pushCommentReferenceCache(key, content);
        const lineFeeds = match.match(/\n/g) ?? [];
        return lineFeeds.join('');
      });
      // 替换实际引用
      $str = this.replaceReferences($str);
      this.$cleanCache();
    }
    return $str;
  }

  makeHtml(str, sentenceMakeFunc) {
    return str;
  }

  afterMakeHtml(str) {
    return UrlCache.restoreAll(str);
  }

  rule() {
    const ret = {
      begin: '(^|\\n)[ \t]*',
      content: [
        '\\[([^^][^\\]]*?)\\]:\\h*', // comment key
        '([^\\n]+?)', // comment content
      ].join(''),
      end: '(?=$|\\n)',
    };
    ret.reg = compileRegExp(ret, 'g', true);
    return ret;
  }
}
