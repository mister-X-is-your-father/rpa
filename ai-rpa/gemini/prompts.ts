/**
 * 画像生成プロンプト管理
 * ここにプロンプトを追加・編集して使う
 */

export interface PromptEntry {
  /** プロンプトの識別名 */
  name: string;
  /** Geminiに送るプロンプトテキスト */
  prompt: string;
  /** 画像を添付する場合のパス (省略可) */
  imagePath?: string;
}

/**
 * 使いたいプロンプトをここに定義
 * 上から順に実行される
 */
export const prompts: PromptEntry[] = [
  {
    name: "sample",
    prompt: "この画像をアニメ風に加工してください",
    imagePath: undefined, // 必要なら画像パスを指定
  },
  // {
  //   name: "another_style",
  //   prompt: "この画像を水彩画風にしてください",
  //   imagePath: "./input/photo.png",
  // },
];

/**
 * リトライ時に使う代替プロンプト
 * 元のプロンプトで品質NGが続いた場合に切り替える
 */
export const fallbackPrompts: Record<string, string[]> = {
  sample: [
    "この画像をもっと鮮やかなアニメ風に加工してください。細部まで丁寧に仕上げてください",
    "この画像を高品質なアニメイラスト風に変換してください。色彩を豊かにしてください",
  ],
};
