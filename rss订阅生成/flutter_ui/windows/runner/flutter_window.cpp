#include "flutter_window.h"

#include <optional>
#include <fstream>
#include <string>

#include "flutter/generated_plugin_registrant.h"
#include "resource.h"

#define WM_TRAY_ICON (WM_USER + 101)
#define IDM_TRAY_SHOW 1001
#define IDM_TRAY_EXIT 1002

FlutterWindow::FlutterWindow(const flutter::DartProject& project)
    : project_(project) {}

FlutterWindow::~FlutterWindow() {
  ShowTrayIcon(false);
}

void FlutterWindow::LoadConfig() {
  std::ifstream f("gui_config.json");
  if (!f.is_open()) return;
  std::string line;
  while (std::getline(f, line)) {
    if (line.find("\"no_tray\"") != std::string::npos) {
      no_tray_ = (line.find("true") != std::string::npos);
    }
    if (line.find("\"start_minimized\"") != std::string::npos) {
      start_minimized_ = (line.find("true") != std::string::npos);
    }
  }
}

void FlutterWindow::ShowTrayIcon(bool show) {
  if (show) {
    if (!tray_icon_created_) {
      memset(&nid_, 0, sizeof(NOTIFYICONDATAW));
      nid_.cbSize = sizeof(NOTIFYICONDATAW);
      nid_.hWnd = GetHandle();
      nid_.uID = 1;
      nid_.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
      nid_.uCallbackMessage = WM_TRAY_ICON;
      nid_.hIcon = LoadIcon(GetModuleHandle(nullptr), MAKEINTRESOURCE(IDI_APP_ICON));
      wcscpy_s(nid_.szTip, L"RSS \x52a8\x6001\x670d\x52a1\x7ba1\x7406");
      Shell_NotifyIconW(NIM_ADD, &nid_);
      tray_icon_created_ = true;
    }
  } else {
    if (tray_icon_created_) {
      Shell_NotifyIconW(NIM_DELETE, &nid_);
      tray_icon_created_ = false;
    }
  }
}

void FlutterWindow::HideToTray() {
  ShowWindow(GetHandle(), SW_HIDE);
  ShowTrayIcon(true);
}

void FlutterWindow::RestoreFromTray() {
  ShowWindow(GetHandle(), SW_SHOW);
  ShowWindow(GetHandle(), SW_RESTORE);
  SetForegroundWindow(GetHandle());
  SetFocus(GetHandle());
}

bool FlutterWindow::OnCreate() {
  if (!Win32Window::OnCreate()) {
    return false;
  }

  LoadConfig();

  RECT frame = GetClientArea();

  flutter_controller_ = std::make_unique<flutter::FlutterViewController>(
      frame.right - frame.left, frame.bottom - frame.top, project_);
  if (!flutter_controller_->engine() || !flutter_controller_->view()) {
    return false;
  }
  RegisterPlugins(flutter_controller_->engine());
  SetChildContent(flutter_controller_->view()->GetNativeWindow());

  // Register MethodChannel to communicate with Flutter Dart code
  channel_ = std::make_unique<flutter::MethodChannel<flutter::EncodableValue>>(
      flutter_controller_->engine()->messenger(),
      "com.rssmanager/window",
      &flutter::StandardMethodCodec::GetInstance());

  channel_->SetMethodCallHandler([this](const flutter::MethodCall<flutter::EncodableValue>& call,
                                        std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result) {
    if (call.method_name() == "updateConfig") {
      const auto* args = std::get_if<flutter::EncodableMap>(call.arguments());
      if (args) {
        auto it_no_tray = args->find(flutter::EncodableValue("no_tray"));
        if (it_no_tray != args->end() && std::holds_alternative<bool>(it_no_tray->second)) {
          no_tray_ = std::get<bool>(it_no_tray->second);
          if (no_tray_) {
            ShowTrayIcon(false);
          }
        }
        auto it_min = args->find(flutter::EncodableValue("start_minimized"));
        if (it_min != args->end() && std::holds_alternative<bool>(it_min->second)) {
          start_minimized_ = std::get<bool>(it_min->second);
        }
      }
      result->Success();
    } else if (call.method_name() == "hideToTray") {
      HideToTray();
      result->Success();
    } else if (call.method_name() == "showWindow") {
      RestoreFromTray();
      result->Success();
    } else if (call.method_name() == "exitApp") {
      is_quitting_ = true;
      ShowTrayIcon(false);
      DestroyWindow(GetHandle());
      PostQuitMessage(0);
      result->Success();
    } else {
      result->NotImplemented();
    }
  });

  flutter_controller_->engine()->SetNextFrameCallback([this]() {
    if (start_minimized_) {
      this->HideToTray();
    } else {
      this->Show();
    }
  });

  flutter_controller_->ForceRedraw();
  return true;
}

void FlutterWindow::OnDestroy() {
  ShowTrayIcon(false);
  if (channel_) {
    channel_ = nullptr;
  }
  if (flutter_controller_) {
    flutter_controller_ = nullptr;
  }

  Win32Window::OnDestroy();
}

LRESULT
FlutterWindow::MessageHandler(HWND hwnd, UINT const message,
                              WPARAM const wparam,
                              LPARAM const lparam) noexcept {
  if (message == WM_SYSCOMMAND) {
    if ((wparam & 0xFFF0) == SC_MINIMIZE) {
      HideToTray();
      return 0; // Prevent default taskbar minimization, hide completely from taskbar!
    }
  } else if (message == WM_CLOSE) {
    if (!is_quitting_) {
      HideToTray();
      return 0; // Hide to tray instead of exiting on 'X' click
    }
  } else if (message == WM_TRAY_ICON) {
    if (lparam == WM_LBUTTONUP || lparam == WM_LBUTTONDBLCLK) {
      RestoreFromTray();
      return 0;
    } else if (lparam == WM_RBUTTONUP) {
      POINT pt;
      GetCursorPos(&pt);
      HMENU hMenu = CreatePopupMenu();
      AppendMenuW(hMenu, MF_STRING, IDM_TRAY_SHOW, L"\x663e\x793a\x4e3b\x7a97\x53e3");
      AppendMenuW(hMenu, MF_SEPARATOR, 0, nullptr);
      AppendMenuW(hMenu, MF_STRING, IDM_TRAY_EXIT, L"\x9000\x51fa\x7a0b\x5e8f");
      SetForegroundWindow(hwnd);
      int cmd = TrackPopupMenu(hMenu, TPM_RETURNCMD | TPM_NONOTIFY, pt.x, pt.y, 0, hwnd, nullptr);
      DestroyMenu(hMenu);
      if (cmd == IDM_TRAY_SHOW) {
        RestoreFromTray();
      } else if (cmd == IDM_TRAY_EXIT) {
        if (channel_) {
          channel_->InvokeMethod("trayExit", nullptr);
        } else {
          is_quitting_ = true;
          ShowTrayIcon(false);
          _wsystem(L"taskkill /F /T /IM rss_engine.exe >nul 2>&1");
          DestroyWindow(hwnd);
          PostQuitMessage(0);
        }
      }
      return 0;
    }
  }

  if (flutter_controller_) {
    std::optional<LRESULT> result =
        flutter_controller_->HandleTopLevelWindowProc(hwnd, message, wparam,
                                                      lparam);
    if (result) {
      return *result;
    }
  }

  switch (message) {
    case WM_FONTCHANGE:
      flutter_controller_->engine()->ReloadSystemFonts();
      break;
  }

  return Win32Window::MessageHandler(hwnd, message, wparam, lparam);
}
