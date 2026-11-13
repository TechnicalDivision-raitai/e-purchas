export function GuidePage() {
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[10px] border border-[#dce8f5] bg-white">
        <div className="border-b border-[#e6eff8] bg-gradient-to-r from-white to-[#f7fbff] px-5 py-4">
          <h2 className="text-[14px] font-semibold text-[#315c88]">
            ระบบบริหารงานจัดซื้อจัดจ้าง · กองช่าง อบต.ไร่ใต้
          </h2>
        </div>

        <div className="space-y-3.5 p-5 text-xs leading-loose text-[#4e6783]">
          <p>
            เพิ่ม ดู และแก้ไขโครงการด้วย 5 แท็บตามกระบวนการ ได้แก่ ข้อมูลทั่วไป TOR
            และราคากลาง สั่งซื้อสั่งจ้าง ตั้งกรรมการและตรวจรับ และฎีกา
            ข้อมูลหลักเดิมเชื่อมกรรมการ ผลตรวจรับ และไฟล์แนบโดยไม่สร้างโครงการซ้ำ
          </p>

          <div className="rounded-lg border border-[#f2deb9] bg-[#fff8ed] p-3.5 text-[11.5px] leading-relaxed text-[#8d672b]">
            ระบบจัดเก็บข้อมูลแคชในเครื่อง (localStorage) คู่กับสถานะเข้าสู่ระบบในเซสชัน
            (sessionStorage) และรองรับการซิงค์อัตโนมัติกับ Google Apps Script (Google
            Sheet + Google Drive) เมื่อกำหนด URL/Folder ID ในการเชื่อมต่อแล้ว
          </div>

          <p>
            ต้องเข้าสู่ระบบผ่านหน้า Login ก่อนใช้งาน: <b>แอดมิน (admin)</b> สร้าง แก้ไข
            ลบ รับทราบ เปลี่ยนสถานะ ตั้งค่ากระบวนการ และนำเข้า Excel ได้ ส่วน{' '}
            <b>เจ้าหน้าที่ (staff)</b> ดูข้อมูลและส่งออกเท่านั้น
            โดยระบบจะซ่อนปุ่มเพิ่ม แก้ไข ลบ นำเข้า และซ่อนตัวสลับสิทธิ์ทั้งหมด
          </p>

          <p>
            ช่องรายชื่อผู้รับผิดชอบ กรรมการ ตำแหน่ง ผู้ขาย วิธีจัดซื้อจัดจ้าง และแหล่งงบ
            มีระบบช่วยกรอกอัตโนมัติ (AutoSuggest) ที่แนะนำเมื่อพิมพ์อย่างน้อย 1 ตัวอักษร
            แสดงผลบรรทัดเดียวสูงสุด 8 รายการ
          </p>

          <p>
            ปีเริ่มต้นโครงการใหม่ 2570 แก้ไขคงปีเดิม วันที่ขออนุมัติแสดง พ.ศ. เก็บ
            YYYY-MM-DD ค.ศ. คำนวณวันตาม Asia/Bangkok งานพักยังนับเป็นงานค้าง
            เสร็จสิ้นและยกเลิกไม่อยู่ในงานค้าง ยอดรวมไม่นับพักงานและยกเลิก
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-[10px] border border-[#dce8f5] bg-white">
        <div className="border-b border-[#e6eff8] bg-gradient-to-r from-white to-[#f7fbff] px-5 py-4">
          <h2 className="text-[14px] font-semibold text-[#315c88]">
            Excel ครบทุกหมวด (Upsert)
          </h2>
        </div>

        <div className="space-y-3.5 p-5 text-xs leading-loose text-[#4e6783]">
          <p>
            ดาวน์โหลดแม่แบบจากหน้า Excel ลบข้อมูลตัวอย่างก่อนใช้ กรอกข้อมูลทั้ง 5
            หมวดและตารางลูกโดยใช้รหัสโครงการตรงกัน รหัส/เลขเอกสารเป็นข้อความ วันที่
            YYYY-MM-DD ค.ศ. จำนวนเงิน ลำดับ และงวดเป็นตัวเลข
          </p>

          <p>
            รองรับการนำเข้าแบบ <b>Upsert</b> หากพบรหัสโครงการตรงกับที่มีอยู่แล้ว
            ระบบจะอัปเดตข้อมูลรายการเดิมให้เป็นปัจจุบัน หากเป็นรหัสใหม่จะเพิ่มเข้าระบบ
            และหากหมวดย่อยของโครงการใดผิดพลาด โครงการนั้นจะไม่ถูกนำเข้าบางส่วน
          </p>

          <p>
            การส่งออกจากระบบนี้รวมเอกสารทุกหมวดพร้อมสรุปวงเงินที่ไม่นับงานพัก/ยกเลิก
            การนำเข้าจำกัดไฟล์ 10 MB และ 5,000 แถวรวมต่อครั้ง
          </p>
        </div>
      </section>
    </div>
  );
}
