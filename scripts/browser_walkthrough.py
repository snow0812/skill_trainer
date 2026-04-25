#!/usr/bin/env python3
"""Headless walkthrough of User Twin Studio main routes (Selenium + Chrome)."""

from __future__ import annotations

import sys
import time
from dataclasses import dataclass, field

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

BASE = "http://127.0.0.1:5174"
MATURE_PROJECT = "agent产品经理"  # 侧栏需存在；用于「可验证」链路
IMMATURE_HINT = "我的个人操作系统"  # 列表中通常存在；用于锁定验证


@dataclass
class Report:
    issues: list[str] = field(default_factory=list)
    steps: list[str] = field(default_factory=list)

    def ok(self, msg: str) -> None:
        self.steps.append(f"OK  {msg}")

    def bad(self, msg: str) -> None:
        self.issues.append(msg)
        self.steps.append(f"!!  {msg}")


def wait_body(driver, timeout: float = 30) -> None:
    WebDriverWait(driver, timeout).until(EC.presence_of_element_located((By.TAG_NAME, "body")))


def select_project(driver, name: str, report: Report, timeout: float = 45) -> None:
    wait = WebDriverWait(driver, timeout)
    # 项目名通常无引号；若含 ' 需转义
    safe = name.replace("'", "', \"'\", '")
    btn = wait.until(
        EC.element_to_be_clickable(
            (
                By.XPATH,
                f"//button[contains(@class,'project') and .//strong[contains(., '{safe}')]]",
            )
        )
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", btn)
    btn.click()
    wait.until(
        EC.presence_of_element_located(
            (
                By.XPATH,
                f"//div[contains(@class,'current-project-card')]//strong[contains(., '{safe}')]",
            )
        )
    )
    report.ok(f"切换项目 → {name}")


def current_url(driver) -> str:
    return driver.current_url.replace(BASE, "") or "/"


def run() -> int:
    report = Report()
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1440,2200")
    # 便于发现前端异常
    opts.set_capability(
        "goog:loggingPrefs",
        {"browser": "ALL"},
    )

    driver = webdriver.Chrome(options=opts)
    wait = WebDriverWait(driver, 40)

    try:
        # --- 成熟项目：各主路径可访问性 ---
        driver.get(f"{BASE}/start")
        wait_body(driver)
        wait.until(EC.presence_of_element_located((By.CLASS_NAME, "project-list")))
        try:
            select_project(driver, MATURE_PROJECT, report)
        except Exception as e:
            report.bad(f"无法选中成熟项目「{MATURE_PROJECT}」: {e}")
            print(report.steps, report.issues, sep="\n")
            return 2

        routes_mature = [
            "/start",
            "/materials",
            "/summary",
            "/correction",
            "/correction/profile",
            "/validation",
            "/validation/run",
        ]
        for path in routes_mature:
            driver.get(f"{BASE}{path}")
            time.sleep(1.2)
            url = driver.current_url
            tail = path.rstrip("/") or "/"
            if tail not in url.replace(BASE, ""):
                report.bad(f"成熟项目：打开 {path} 后期望 URL 含 {tail}，实际 {url}")
            else:
                report.ok(f"成熟项目：{path} → {current_url(driver)}")

        # 反馈页无 preview：应被挡回 run
        driver.get(f"{BASE}/validation/feedback")
        time.sleep(1.5)
        u = driver.current_url
        if "/validation/feedback" in u and "/validation/run" not in u:
            report.bad(
                "无试运行结果时深链 /validation/feedback：应重定向到 /validation/run，"
                f"当前 {u}"
            )
        else:
            report.ok(f"无 preview 时 feedback 深链 → {current_url(driver)}")

        # 深链 run：刷新后仍应保持（依赖 localStorage 项目）
        driver.get(f"{BASE}/validation/run")
        time.sleep(1.5)
        safe_m = MATURE_PROJECT.replace("'", "', \"'\", '")
        card = driver.find_elements(
            By.XPATH,
            f"//div[contains(@class,'current-project-card')]//strong[contains(., '{safe_m}')]",
        )
        if not card:
            report.bad("深链 /validation/run 后当前项目卡片不是成熟项目（可能未持久化 activeProject）")
        else:
            report.ok("深链 /validation/run 后当前项目仍为成熟项目")

        # --- 不成熟项目：验证阶段应被挡 ---
        select_project(driver, IMMATURE_HINT, report)
        driver.get(f"{BASE}/validation/run")
        time.sleep(1.5)
        if "/validation/run" in driver.current_url:
            report.bad(
                f"待补材料项目打开 /validation/run 应离开验证 URL，当前仍为 {driver.current_url}"
            )
        else:
            report.ok(f"待补材料项目访问验证 → 重定向到 {current_url(driver)}")

        # --- 控制台严重报错 ---
        severe: list[str] = []
        log_ok = False
        try:
            for entry in driver.get_log("browser"):
                msg = entry.get("message", "")
                level = entry.get("level", "")
                if level == "SEVERE" and any(
                    x in msg for x in ("Uncaught", "TypeError", "ReferenceError", "Failed to fetch")
                ):
                    severe.append(msg[:240])
            log_ok = True
        except Exception as e:
            report.ok(f"跳过控制台日志（{e}）")
        if log_ok:
            if severe:
                for s in severe[:8]:
                    report.bad(f"浏览器控制台: {s}")
            else:
                report.ok("未发现典型 SEVERE 控制台报错（抽样）")

    finally:
        driver.quit()

    print("=== 走查步骤 ===")
    for s in report.steps:
        print(s)
    print("\n=== 问题 ===")
    if not report.issues:
        print("未发现脚本判定的问题。")
        return 0
    for i in report.issues:
        print(i)
    return 1


if __name__ == "__main__":
    sys.exit(run())
