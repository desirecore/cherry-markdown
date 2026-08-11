/** Stable configuration values; display strings live in package.nls*.json. */
export type ImageUploadMode = 'workspace' | 'data' | 'remote';

// 自定义上传配置
export interface CustomUploader {
  enable: boolean;
  url: string;
  headers?: Record<string, string>;
  /** Internal compatibility marker written only while migrating the legacy PicGo setting. */
  protocol?: 'picgo';
}

// 回填图片附加参数（增加 isNotBorder 支持“无边框”选项）
export type BackfillImageProp = 'isBorder' | 'isNotBorder' | 'isShadow' | 'isRadius';
export type BackfillImageProps = BackfillImageProp[];

// 返回类型
// export type BackfillImage = Partial<Record<BackfillImageProps[number], boolean>>;
export type BackfillImage = Partial<Record<BackfillImageProp, boolean>>;

export interface UploadFileRequest {
  requestId: number;
  documentUri: string;
}

export interface UploadFileResult extends BackfillImage {
  requestId: number;
  documentUri: string;
  name: string;
  url: string;
  poster?: string;
}
