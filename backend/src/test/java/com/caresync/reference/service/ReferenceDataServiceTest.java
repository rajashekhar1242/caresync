package com.caresync.reference.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.ValidationException;
import com.caresync.reference.dto.DepartmentRequest;
import com.caresync.reference.dto.DepartmentResponse;
import com.caresync.reference.entity.Department;
import com.caresync.reference.repository.ClinicRepository;
import com.caresync.reference.repository.DepartmentRepository;
import com.caresync.reference.repository.SpecializationRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

@ExtendWith(MockitoExtension.class)
class ReferenceDataServiceTest {

    @Mock
    private ClinicRepository clinicRepository;

    @Mock
    private SpecializationRepository specializationRepository;

    @Mock
    private DepartmentRepository departmentRepository;

    private ReferenceDataService service;

    @BeforeEach
    void setUp() {
        service = new ReferenceDataService(clinicRepository, specializationRepository, departmentRepository);
    }

    @Test
    void createDepartmentNormalizesAndRejectsDuplicatesAndShortTrimmedNames() {
        when(departmentRepository.existsByNameIgnoreCase("Cardiology")).thenReturn(false);
        when(departmentRepository.saveAndFlush(any(Department.class))).thenAnswer(inv -> inv.getArgument(0));

        DepartmentResponse created = service.createDepartment(new DepartmentRequest("  Cardiology  ", "   "));
        assertThat(created.id()).isNotNull();
        assertThat(created.name()).isEqualTo("Cardiology");
        assertThat(created.description()).isNull();

        when(departmentRepository.existsByNameIgnoreCase("cardiology")).thenReturn(true);
        assertThatThrownBy(() -> service.createDepartment(new DepartmentRequest("cardiology", "Heart care")))
                .isInstanceOf(ConflictException.class)
                .satisfies(ex -> assertThat(((ConflictException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.DEPARTMENT_NAME_EXISTS));

        assertThatThrownBy(() -> service.createDepartment(new DepartmentRequest(" A ", null)))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void createDepartmentTranslatesConstraintViolationRace() {
        when(departmentRepository.existsByNameIgnoreCase("Neurology")).thenReturn(false);
        when(departmentRepository.saveAndFlush(any(Department.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate key"));

        assertThatThrownBy(() -> service.createDepartment(new DepartmentRequest("Neurology", null)))
                .isInstanceOf(ConflictException.class)
                .satisfies(ex -> assertThat(((ConflictException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.DEPARTMENT_NAME_EXISTS));
    }

    @Test
    void updateDepartmentReplacesFieldsAndRejectsMissingOrDuplicateName() {
        UUID deptId = UUID.randomUUID();
        Department existing = new Department(deptId, "Ortho", "Old");
        when(departmentRepository.findById(deptId)).thenReturn(Optional.of(existing));
        when(departmentRepository.existsByNameIgnoreCaseAndIdNot("Orthopedics", deptId)).thenReturn(false);
        when(departmentRepository.saveAndFlush(existing)).thenReturn(existing);

        DepartmentResponse updated = service.updateDepartment(
                deptId, new DepartmentRequest("Orthopedics", "Bone and joint care"));
        assertThat(updated.name()).isEqualTo("Orthopedics");
        assertThat(updated.description()).isEqualTo("Bone and joint care");

        UUID missingId = UUID.randomUUID();
        when(departmentRepository.findById(missingId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.updateDepartment(missingId, new DepartmentRequest("ENT", null)))
                .isInstanceOf(ResourceNotFoundException.class);

        when(departmentRepository.existsByNameIgnoreCaseAndIdNot("Cardiology", deptId)).thenReturn(true);
        assertThatThrownBy(() -> service.updateDepartment(deptId, new DepartmentRequest("Cardiology", null)))
                .isInstanceOf(ConflictException.class)
                .satisfies(ex -> assertThat(((ConflictException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.DEPARTMENT_NAME_EXISTS));
    }
}
