// 构建期开关：静态版（GitHub Pages / 纯静态托管）没有协作后端，隐藏协作入口。
// 用 `VITE_STATIC=1 npm run build` 打包即可。
export const IS_STATIC_BUILD = import.meta.env.VITE_STATIC === '1';
