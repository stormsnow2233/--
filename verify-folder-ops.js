const { spawn } = require('child_process');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const server = spawn(process.execPath, ['server.js'], { cwd: __dirname, stdio: 'inherit' });
  await wait(1200);

  try {
    const createRes = await fetch('http://localhost:3000/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '测试目录', parent_id: 0, authKey: 'admin123' }),
    });

    const createJson = await createRes.json();
    console.log('CREATE_FOLDER_STATUS', createRes.status, createJson);
    if (!createRes.ok || !createJson.folder || !createJson.folder.name) {
      throw new Error('创建文件夹失败');
    }

    const moveRes = await fetch('http://localhost:3000/api/items/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: createJson.folder.id, parent_id: 0, authKey: 'admin123' }),
    });
    const moveJson = await moveRes.json();
    console.log('MOVE_ITEM_STATUS', moveRes.status, moveJson);
    if (!moveRes.ok) {
      throw new Error('移动文件失败');
    }
  } finally {
    server.kill('SIGTERM');
    await wait(300);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
