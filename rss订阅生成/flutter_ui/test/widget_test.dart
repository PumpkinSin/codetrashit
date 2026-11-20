// 应用依赖本地引擎进程与平台通道，无法在纯 widget 测试环境中启动，
// 这里仅保留占位测试保证测试目录可用。

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('placeholder', () {
    expect(1 + 1, 2);
  });
}
