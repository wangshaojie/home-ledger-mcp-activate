// ⚠️ DEPRECATED 占位 - 实际 API 都在 pages/api/ 下
// Vercel 在 Next.js 项目里会编译 api/ 顶层的 .ts/.js 文件(当成原生 serverless function)
// 所以这里必须用 CommonJS 语法,而不能用 ESM `export default`
// 真正的 issue-token 逻辑在 pages/api/issue-token.ts(也已废弃,新版用 pages/api/send-otp + pages/api/exchange)
// 此文件永不被调用,只是为了避免 Vercel 构建时尝试加载 ESM 模块失败

module.exports = function deprecated_stub(_req, res) {
  res.status(410).json({
    error: 'gone',
    message: '此端点已废弃,请使用 /api/send-otp + /api/exchange',
  });
};
