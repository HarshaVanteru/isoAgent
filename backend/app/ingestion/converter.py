import logging
import os
import shutil
import subprocess
from pathlib import Path
from ..core.errors import ConversionError
from ..utils.file_utils import content_hash
from ..utils.cleanup import temporary_directory

log = logging.getLogger(__name__)


class OfficeConverter:
    def __init__(self, settings):
        self.settings = settings

    def executable(self):
        candidate = self.settings.office_executable or (shutil.which('soffice.com') if os.name == 'nt' else None) or shutil.which('soffice') or shutil.which('libreoffice')
        if candidate:
            return self.console_executable(candidate)
        for location in ('C:/Program Files/LibreOffice/program/soffice.exe',
                         'C:/Program Files (x86)/LibreOffice/program/soffice.exe'):
            if Path(location).is_file():
                return self.console_executable(location)
        raise ConversionError('Install LibreOffice or set LIBREOFFICE_PATH for legacy Office files')

    @staticmethod
    def console_executable(candidate):
        path = Path(candidate)
        if os.name == 'nt' and path.name.lower() == 'soffice.exe' and path.with_suffix('.com').is_file():
            return str(path.with_suffix('.com'))
        return str(candidate)

    def convert(self, path: Path) -> Path:
        extension = path.suffix.lower()
        targets = {'.doc': 'docx', '.xls': 'xlsx', '.vsd': 'pdf', '.vsdx': 'pdf'}
        if extension not in targets:
            return path
        target = targets[extension]
        destination = self.settings.data_dir / 'converted' / content_hash(path)
        destination.mkdir(parents=True, exist_ok=True)
        output = destination / f'{path.stem}.{target}'
        with path.open('rb') as stream:
            modern_container = stream.read(4) == b'PK\x03\x04'
        if modern_container and extension in {'.doc', '.xls'}:
            shutil.copyfile(path, output)
            return output
        log.info('Conversion started: %s', path.name)
        try:
            # LibreOffice builds deeply nested profile paths. Keeping its
            # workspace outside the content-hash directory avoids Windows
            # path-length failures during first-run extension initialization.
            work_root = self.settings.data_dir / '.office-work'
            work_root.mkdir(parents=True, exist_ok=True)
            with temporary_directory(work_root) as work:
                profile = (Path(work) / 'profile').as_uri()
                subprocess.run([self.executable(), f'-env:UserInstallation={profile}',
                                '--headless', '--norestore', '--convert-to', target, '--outdir', str(work),
                                str(path.resolve())], check=True, capture_output=True,
                               timeout=self.settings.conversion_timeout)
                produced = Path(work) / output.name
                if not produced.is_file() or not produced.stat().st_size:
                    raise ConversionError('LibreOffice did not produce a nonempty converted file')
                shutil.copyfile(produced, output)
        except ConversionError:
            raise
        except (OSError, subprocess.SubprocessError) as exc:
            log.exception('Conversion failed: %s', path.name)
            raise ConversionError('LibreOffice conversion failed; check server logs') from exc
        log.info('Conversion completed: %s', path.name)
        return output
