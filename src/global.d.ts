export {};

declare global {
  const localforage: any;
  const pdfjsLib: any;
  const mammoth: any;
  const nlp: any;
  const winkNlpInst: any;
  const winkIts: any;
  const d3: any;
  const QRCode: any;

  interface HTMLElement {
    value?: any;
    disabled?: any;
    checked?: any;
    files?: any;
    max?: any;
    selectionStart?: any;
    selectionEnd?: any;
    setSelectionRange?: any;
  }

  interface Element {
    dataset?: any;
    checked?: any;
    disabled?: any;
    click?: any;
    style?: any;
    offsetHeight?: any;
  }

  interface EventTarget {
    value?: any;
    checked?: any;
    closest?: any;
    files?: any;
    style?: any;
  }

  interface Window {
    [key: string]: any;
  }
}

declare module "*.css" {
  const content: any;
  export default content;
}
