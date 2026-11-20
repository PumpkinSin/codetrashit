#ifndef RUNNER_FLUTTER_WINDOW_H_
#define RUNNER_FLUTTER_WINDOW_H_

#include <flutter/dart_project.h>
#include <flutter/flutter_view_controller.h>
#include <flutter/method_channel.h>
#include <flutter/standard_method_codec.h>
#include <flutter/encodable_value.h>
#include <windows.h>
#include <shellapi.h>

#include <memory>
#include <string>

#include "win32_window.h"

// A window that hosts a Flutter view and manages Windows system tray & minimize-to-tray.
class FlutterWindow : public Win32Window {
 public:
  explicit FlutterWindow(const flutter::DartProject& project);
  virtual ~FlutterWindow();

  void HideToTray();
  void RestoreFromTray();
  void ShowTrayIcon(bool show);
  void LoadConfig();

 protected:
  bool OnCreate() override;
  void OnDestroy() override;
  LRESULT MessageHandler(HWND window, UINT const message, WPARAM const wparam,
                         LPARAM const lparam) noexcept override;

 private:
  flutter::DartProject project_;
  std::unique_ptr<flutter::FlutterViewController> flutter_controller_;
  std::unique_ptr<flutter::MethodChannel<flutter::EncodableValue>> channel_;

  NOTIFYICONDATAW nid_ = {};
  bool tray_icon_created_ = false;
  bool is_quitting_ = false;
  bool no_tray_ = false;
  bool start_minimized_ = false;
};

#endif  // RUNNER_FLUTTER_WINDOW_H_
