import { NumberUtil } from '../utils/NumberUtil';

export interface IColorData {
    visible: boolean;
    alphaPercent: number;
    alphaAmount: number;
    redPercent: number;
    redAmount: number;
    greenPercent: number;
    greenAmount: number;
    bluePercent: number;
    blueAmount: number;
}

export class ConverterColor {
    private _parent:ConverterColor;
    private _data:IColorData;

    public constructor(data:IColorData = null) {
        this._parent = null;
        this._data = data;
    }

    public static fromElement(element:FlashElement): IColorData {
        if (!element) return null;
        return {
            visible: element.visible,
            alphaPercent: element.colorAlphaPercent,
            alphaAmount: element.colorAlphaAmount,
            redPercent: element.colorRedPercent,
            redAmount: element.colorRedAmount,
            greenPercent: element.colorGreenPercent,
            greenAmount: element.colorGreenAmount,
            bluePercent: element.colorBluePercent,
            blueAmount: element.colorBlueAmount
        };
    }

    public blend(element:FlashElement, overrideData: IColorData = null):ConverterColor {
        const data = overrideData || ConverterColor.fromElement(element);
        const color = new ConverterColor(data);
        color._parent = this;
        return color;
    }

    public merge():string {
        let current:ConverterColor = this;

        let visible = 1;
        let alpha = 1;
        let red = 1;
        let green = 1;
        let blue = 1;

        //-----------------------------------

        while (current != null && current._data != null) {
            const data = current._data;

            if (data.visible === false) {
                visible = 0;
            }

            alpha = visible * NumberUtil.clamp(alpha * (data.alphaPercent / 100) + data.alphaAmount / 255);
            red = NumberUtil.clamp(red * (data.redPercent / 100) + data.redAmount / 255);
            green = NumberUtil.clamp(green * (data.greenPercent / 100) + data.greenAmount / 255);
            blue = NumberUtil.clamp(blue * (data.bluePercent / 100) + data.blueAmount / 255);

            current = current._parent;
        }

        //-----------------------------------

        return (
            NumberUtil.color(red) +
            NumberUtil.color(green) +
            NumberUtil.color(blue) +
            NumberUtil.color(alpha)
        );
    }
}
