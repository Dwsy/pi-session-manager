declare module 'wordcloud' {
  export type WordCloudListItem = [string, number] | [string, number, number]
  export interface WordCloudOptions {
    list: WordCloudListItem[]
    weightFactor?: number | ((weight: number) => number)
    fontFamily?: string
    color?: string | ((word: string, weight: number, fontSize: number, distance: number, theta: number) => string)
    backgroundColor?: string
    gridSize?: number
    minSize?: number
    drawOutOfBound?: boolean
    rotateRatio?: number
    shuffle?: boolean
    wait?: number
    shape?: string | ((theta: number) => number)
    hover?: (item?: WordCloudListItem, dimension?: { x: number; y: number; w: number; h: number }, event?: MouseEvent) => void
    click?: (item: WordCloudListItem, dimension?: { x: number; y: number; w: number; h: number }, event?: MouseEvent) => void
    clearCanvas?: boolean
    ellipticity?: number
  }

  export default function WordCloud(canvas: HTMLCanvasElement, options: WordCloudOptions): void
}
