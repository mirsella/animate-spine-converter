import { JsonUtil } from './JsonUtil';
import { NumberUtil } from './NumberUtil';

export class JsonFormatUtil {
    public static cleanObject(source:any):any {
        const result:any = {};

        /**
         * Removing undefined, incorrect or non-essential properties
         * to reduce output JSON file size.
         */

        for (const key in source) {
            const value = source[key];

            if (value === null && key === 'name') {
                result[key] = null;
                continue;
            }

            if (JsonUtil.validNumber(value)) {
                const normalizedValue = NumberUtil.normalizeJsonNumber(value);

                if (key === 'shearX' || key === 'shearY' || key === 'rotation') {
                    if (normalizedValue !== 0) {
                        result[key] = normalizedValue;
                    }

                    continue;
                }

                if (key === 'scaleX' || key === 'scaleY') {
                    if (normalizedValue !== 1) {
                        result[key] = normalizedValue;
                    }

                    continue;
                }

                result[key] = normalizedValue;
            }

            if (JsonUtil.validArray(value)) {
                if (JsonUtil.nonEmptyArray(value)) {
                    result[key] = value;
                }

                continue;
            }

            if (JsonUtil.validObject(value)) {
                if (JsonUtil.nonEmptyObject(value)) {
                    result[key] = value;
                }

                continue;
            }

            if (JsonUtil.validBoolean(value)) {
                result[key] = value;
            }

            if (JsonUtil.validString(value)) {
                result[key] = value;
            }
        }

        return result;
    }
}
