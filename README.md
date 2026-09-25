# 网盘项目

这是一个基于 Node.js + Express 的简单网盘示例，包含前端页面和后端接口。

## 功能

- 上传文件
- 浏览文件列表
- 下载文件
- 删除文件
- 文件大小和更新时间展示

## 技术栈

- 前端：HTML + CSS + JavaScript
- 后端：Node.js + Express
- 文件存储：本地 uploads 目录

## 启动方式

```bash
npm install
npm start
```

访问：

```text
http://localhost:3000
```

## 目录说明

- `public/`：前端页面和静态资源
- `uploads/`：上传文件存放目录
- `server.js`：后端入口文件

## API

- `GET /api/files`：获取文件列表
- `POST /api/files`：上传文件
- `GET /api/files/:filename`：下载文件
- `DELETE /api/files/:filename`：删除文件

## 备注

这是一个本地开发示例，适合学习前后端分离和文件上传流程。
