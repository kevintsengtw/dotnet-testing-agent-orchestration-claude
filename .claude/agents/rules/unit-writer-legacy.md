# Legacy Code 目標專屬撰寫規則

> 當分析報告的 `targetType === "legacy"` 時，`dotnet-testing-writer` 必須讀取本檔。
> 其他 `targetType` 不需要讀。
>
> **本檔內容屬契約層** —— 讀取後不得偏離，不接受在 `writer-result.deviations` 中說明理由。

## 撰寫規則

- **Characterization Test 思維**：測試目的是「記錄現有行為」而非「驗證預期設計」
- **讀取靜態資料**：參考 `legacyInfo.hardcodedData` 了解靜態類別中寫死的資料，根據實際資料設計測試
- **命名基於實際資料**：測試名稱必須描述「使用哪個靜態資料」+「實際產生的結果」（如 `IsVipUser_使用者ID1消費350元50分_應判定為非VIP`）
- **禁止虛構場景**：不得為靜態資料中不存在的場景撰寫測試方法（如靜態資料中沒有總消費超過 500 的使用者，就不寫「超過500_應回傳true」測試）
- **靜態依賴需 Reflection 測試**（若有 private method）：參考 `private-internal-testing` Skill，使用 `typeof(Class).GetMethod("MethodName", BindingFlags.NonPublic | BindingFlags.Static)` 測試私有方法
- **直接 I/O 測試**：對於 `File.WriteAllText` 等直接 I/O，優先使用 `IDisposable` pattern 清理暫存檔；若 `legacyInfo.directIoOperations` 包含檔案操作，測試後必須清理
- **不可滿足的邊界條件**：在相關測試中用 `// 注意：此邊界條件因靜態資料限制無法直接驗證` 註解記錄即可，不撰寫獨立測試方法
- **檔案清理邏輯集中化**：當使用 `IDisposable` 清理暫存檔時，所有清理邏輯**必須集中在一個方法中**（如 `CleanupFiles()`），`Dispose()` 必須呼叫該方法。禁止在 `Dispose()` 和其他方法中各自實作不同的清理邏輯。
- **時間相依測試資料**：當 Legacy Code 使用 `DateTime.Now` 計算截止日期，且測試需要涵蓋靜態資料中的特定歷史日期時，**禁止使用硬編碼天數**（如 `const int days = 1000`）。改用動態計算確保不因時間流逝而過期：
  ```csharp
  // ✅ 正確：動態計算，永不過期
  var days = (int)(DateTime.UtcNow - new DateTime(2024, 1, 1)).TotalDays + 30;

  // ❌ 錯誤：硬編碼天數，會隨時間流逝而過期
  const int days = 1000;
  ```

## 靜態依賴場景命名

- **核心原則**：測試名稱的「情境」和「預期」必須與 Assert 斷言一致。若 Assert 是 `BeFalse()`，測試名稱不得包含「應回傳true」
- 正確範例：`IsVipUser_使用者ID1總消費350元_應回傳false`（名稱與斷言一致）
- 錯誤範例：`IsVipUser_總消費金額超過500_應回傳true`（但實際 Assert 是 BeFalse，因為靜態資料中無此使用者）
- 範例模板：`方法_使用者ID{N}其{特徵描述}_應{實際行為}`（如 `IsVipUser_使用者ID2消費75元_應判定為非VIP`）
