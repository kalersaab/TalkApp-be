/**
 * @method isEmpty
 * @param {String | Number | Object} value
 * @returns {Boolean} true & false
 * @description this value is Empty Check
 */
/** Convert a Mongoose Map, lean object, or JSON string into a Record. */
export function mapToRecord(value: unknown): Record<string, string> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return mapToRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (value instanceof Map) {
    return Object.fromEntries(value) as Record<string, string>;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, string>) };
  }
  return {};
}

export const isEmpty = (value: string | number | object): boolean => {
  if (value === null) {
    return true;
  } else if (typeof value !== 'number' && value === '') {
    return true;
  } else if (typeof value === 'undefined' || value === undefined) {
    return true;
  } else if (value !== null && typeof value === 'object' && !Object.keys(value).length) {
    return true;
  } else {
    return false;
  }
};
