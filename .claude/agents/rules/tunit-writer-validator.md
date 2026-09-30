# Validator 目標專屬撰寫規則（TUnit）

> 當分析報告的 `targetType === "validator"` 時，`dotnet-testing-advanced-tunit-writer` 必須讀取本檔。
> 其他 `targetType` 不需要讀。
>
> **本檔內容屬契約層** —— 讀取後不得偏離，不接受在 `writer-result.deviations` 中說明理由。

- 斷言以 FluentValidation TestHelper 撰寫，API 怎麼選見 `fluentvalidation-testing` Skill
- 根據 `validatorInfo.rules[]` 為每個屬性的每條規則生成測試案例
- 巢狀 Validator（`validatorInfo.nestedValidators[]`）：測試巢狀物件的驗證傳播
- 自訂方法（`validatorInfo.customMethods[]`）：測試 `Must()` 方法的邏輯，失敗與成功分支各至少一個
- 跨欄位規則（`validatorInfo.crossFieldRules[]`）：測試 `When`/`Unless` 條件，失敗與成功分支各至少一個
- **建構子場景不得略過**：`suggestedTestScenarios` 中首段為 `Constructor` 的場景（Analyzer Step 2.5 強制列管的產出）**必須全數撰寫**，不得因 `validatorInfo.rules[]` 未涵蓋而略過。略過且未於 `deviations` 記錄理由時，Reviewer 判 `error`（與 `dotnet-testing-advanced-tunit-reviewer.md` 的建構子測試覆蓋分流一致）。
- **測試案例數量控制**：優先使用 `[Arguments]` 合併同一屬性多個等價邊界值，避免為每個無效值都建立獨立的無參數 `[Test]`
- **非同步簽章**：`TestValidate()` 為同步呼叫，測試方法仍須為 `public async Task`（尾端 `await Task.CompletedTask`）
- **時間相依 base object（規則 A）**：當 base object 含「比對注入 `TimeProvider` 的日期欄位」（`timeProviderUsage` 非空 或 `specialHandling: "datetime"`）時，`CreateValid{Type}()` 改為 **instance 方法**，時間欄位由 `_timeProvider.GetUtcNow().UtcDateTime.AddYears(-2)` 推導取安全過去日期；禁 `DateTime.UtcNow`/`DateTime.Now`/寫死日期。非時間相依 validator 維持 static + 固定正值。
- **FluentValidation 套件（規則 B）**：**不為取得 FluentValidation 新增 `PackageReference` 或 `ProjectReference`** —— 測試專案既有的、指向 SUT 的 `ProjectReference` 已傳遞性提供 `FluentValidation` 與 `TestHelper`（v10+ 併入主套件）。其他用途的 `.csproj` 變動不受本條限制，一律逐筆列入 `nugetChanges`。
