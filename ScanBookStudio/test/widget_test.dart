import 'package:flutter_test/flutter_test.dart';
import 'package:scanbook_studio/main.dart';

void main() {
  testWidgets('ScanBook Studio renders', (WidgetTester tester) async {
    await tester.pumpWidget(const ScanBookStudioApp());
    expect(find.text('导入 PDF'), findsOneWidget);
  });
}
