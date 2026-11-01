# 来源与致谢

本项目是独立的翻译原型，不是 AI Web for Zotero 的官方版本。

网页侧栏的 XUL browser 布局和 frame-script 消息传递方式参考并改写自：

- AI Web for Zotero — Li Yang
- https://github.com/liyang-tju/AI-Web-for-Zotero
- 参考提交：3fe34fc67803361c9068f2a3cf1249e901d37b52
- MIT License；原始版权声明保留在 LICENSE 中。

PDF 选中文字入口依据 Zotero 源码中的 Reader.registerEventListener 示例：
https://github.com/zotero/zotero/blob/main/chrome/content/zotero/xpcom/reader.js

测试依赖 linkedom 仅用于开发，不打包进插件。
