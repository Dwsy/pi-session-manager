import { PatchDiff } from '@pierre/diffs/react'

// 标准的 unified diff 格式示例
const validDiff = `--- a/example.ts
+++ b/example.ts
@@ -1,3 +1,3 @@
 function hello() {
-  old
+  new
 }
`

export default function DiffTest() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Diff Test</h1>
      <div style={{ border: '1px solid #ccc', padding: '10px', marginTop: '20px' }}>
        <h2>Valid Diff Example:</h2>
        <PatchDiff
          patch={validDiff}
          options={{
            theme: { dark: 'pierre-dark', light: 'pierre-light' },
            diffStyle: 'split',
          }}
        />
      </div>
    </div>
  )
}
