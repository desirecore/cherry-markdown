import { describe, expect, it, vi } from 'vitest';
import { enhanceHtmlForDocx, exportDocxFile } from '../../src/utils/exportDocx';

/** Mock html-to-docx 转换函数 */
const mockDocxConverter = vi.fn(async (html: string) => {
  const encoder = new TextEncoder();
  return encoder.encode(`DOCX:${html.substring(0, 50)}`).buffer;
});

describe('utils/exportDocx', () => {
  describe('enhanceHtmlForDocx', () => {
    it('should handle simple HTML without errors', async () => {
      const html = '<h1>Hello</h1><p>World</p>';
      const result = await enhanceHtmlForDocx(html);
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('should inline table styles', async () => {
      const html = '<table><tr><th>Header</th></tr><tr><td>Data</td></tr></table>';
      const result = await enhanceHtmlForDocx(html);
      expect(result).toContain('border-collapse');
      expect(result).toContain('border');
    });

    it('should inline code block styles', async () => {
      const html = '<pre><code>const x = 1;</code></pre>';
      const result = await enhanceHtmlForDocx(html);
      expect(result).toContain('background-color');
    });

    it('should inline blockquote styles', async () => {
      const html = '<blockquote><p>Quote text</p></blockquote>';
      const result = await enhanceHtmlForDocx(html);
      expect(result).toContain('border-left');
    });

    it('should convert ruby to parenthesized text', async () => {
      const html = '<ruby>汉<rt>hàn</rt></ruby>';
      const result = await enhanceHtmlForDocx(html);
      expect(result).toContain('汉(hàn)');
      expect(result).not.toContain('<ruby>');
    });

    it('should convert audio/video to links', async () => {
      const html = '<video src="https://example.com/video.mp4"></video>';
      const result = await enhanceHtmlForDocx(html);
      expect(result).toContain('example.com/video.mp4');
      expect(result).not.toContain('<video');
    });
  });

  describe('exportDocxFile', () => {
    it('should call saveAsFile callback when provided', async () => {
      const saveAsFile = vi.fn().mockResolvedValue(true);
      const cherry = { options: { fileExport: { saveAsFile, docxConverter: mockDocxConverter } } };

      await exportDocxFile('<p>Test</p>', 'test-file', cherry as any);

      expect(saveAsFile).toHaveBeenCalledTimes(1);
      expect(saveAsFile).toHaveBeenCalledWith(expect.any(Blob), 'test-file.docx');
    });

    it('should fallback to browser download when saveAsFile returns false', async () => {
      const saveAsFile = vi.fn().mockResolvedValue(false);
      const cherry = { options: { fileExport: { saveAsFile, docxConverter: mockDocxConverter } } };

      // Mock URL.createObjectURL and DOM
      const createObjectURL = vi.fn().mockReturnValue('blob:test');
      const revokeObjectURL = vi.fn();
      global.URL.createObjectURL = createObjectURL;
      global.URL.revokeObjectURL = revokeObjectURL;

      await exportDocxFile('<p>Test</p>', 'test-file', cherry as any);

      expect(saveAsFile).toHaveBeenCalled();
      expect(createObjectURL).toHaveBeenCalled();
    });

    it('should return early when no docxConverter provided', async () => {
      // @ts-expect-error -- Logger 依赖 BUILD_ENV 全局变量
      globalThis.BUILD_ENV = 'production';

      const createObjectURL = vi.fn().mockReturnValue('blob:test');
      global.URL.createObjectURL = createObjectURL;

      await exportDocxFile('<p>Test</p>', 'test-file', undefined);

      // 未配置 converter 时不应触发下载
      expect(createObjectURL).not.toHaveBeenCalled();

      // @ts-expect-error -- cleanup
      delete globalThis.BUILD_ENV;
    });

    it('should generate blob with correct MIME type', async () => {
      const saveAsFile = vi.fn().mockResolvedValue(true);
      const cherry = { options: { fileExport: { saveAsFile, docxConverter: mockDocxConverter } } };

      await exportDocxFile('<p>Test</p>', 'test-file', cherry as any);

      const blob = saveAsFile.mock.calls[0][0];
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(blob.size).toBeGreaterThan(0);
    });
  });
});
