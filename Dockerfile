# --- 第一阶段：构建 ---
FROM node:24 AS builder

# 设置工作目录
WORKDIR /app

# 复制依赖定义文件
COPY package*.json ./

# 安装依赖（包括 devDependencies 用于构建）
RUN npm install

# 复制所有源代码
COPY . .

# 执行构建（生成 dist 目录）
RUN npm run build

# --- 第二阶段：运行 ---
FROM node:20-alpine AS runner

WORKDIR /app

# 设置为生产环境
ENV NODE_ENV=production

# 只从构建阶段复制必要文件
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist

# 只安装生产环境依赖
RUN npm install --omit=dev

# 暴露 NestJS 默认端口
EXPOSE 3000

# 启动命令
CMD ["npm", "run", "start:prod"]